use super::damage::apply_staged_damage;
use super::resolution::{apply_impale, resolve_swing, Attack, SwingNeighborhood};
use super::targeting::{find_target, TargetSearch, Targeting};
use super::*;

/// One combat pass; call every tick. Soldier i acts when i % 3 == phase.
pub(crate) fn run_combat(sim: &mut Sim) {
    let n = sim.soldier_count();
    if n == 0 {
        return;
    }
    let tun = sim.tun;
    let phase = (sim.tick_count % 3) as usize;
    let cell = sim.grid.cell_size;

    // Each attacker's RANK among the men targeting his victim (index order,
    // from last tick's targets). Only the first GANG_CAP may SWING: you can't
    // get your weapon onto a foe two comrades already crowd. This caps the
    // gang's DAMAGE without touching targeting or the magnet — every man keeps
    // his foe and his place in the line, so the front and flank geometry are
    // untouched; the (cap+1)th man just presses, unable to land a blow. Capping
    // the local outnumbering is what stops a thinning line being ground 3:1.
    //
    // KEPT DELIBERATELY (David's call): this is a headcount GUARD, not real
    // geometry — strictly speaking how many blades reach a man should fall out
    // of reach/arc/obstruction. It earns its place only as a backstop against a
    // crowd BLOB overrunning a line. Hold it until we're certain the blob is
    // solved by forces alone (the weave compression + body wall); then this
    // can go. Do NOT lean new behavior on it.
    for a in sim.attacked_by.iter_mut() {
        *a = 0;
    }
    // Jacobi staging: zero the per-victim accumulators. Strikes add to them
    // and the whole tick's wounds / shoves / staggers land together after the
    // pass, so index order is not a first-mover advantage (see sim.rs).
    sim.dmg_acc.clear();
    sim.dmg_acc.resize(n, 0.0);
    sim.mount_dmg_acc.clear();
    sim.mount_dmg_acc.resize(n, 0.0);
    sim.dmg_from_charge.clear();
    sim.dmg_from_charge.resize(n, 0.0);
    sim.push_acc.clear();
    sim.push_acc.resize(2 * n, 0.0);
    let mut gang_rank = vec![0u16; n];
    for (i, rank) in gang_rank.iter_mut().enumerate().take(n) {
        if sim.alive[i] == 1 {
            let t = sim.target[i];
            if t >= 0 {
                *rank = sim.attacked_by[t as usize];
                sim.attacked_by[t as usize] += 1;
            }
        }
    }

    // Units anywhere near an enemy (coarse gate so the quiet 90% of the
    // battlefield costs nothing).
    let near_enemy: Vec<bool> = sim
        .units
        .iter()
        .map(|u| {
            let eu = 0.5 * u.width().max(u.depth());
            sim.units.iter().any(|v| {
                v.team != u.team
                    && v.alive_count > 0
                    && (v.center() - u.center()).len() < eu + 0.5 * v.width().max(v.depth()) + 40.0
            })
        })
        .collect();

    for i in (phase..n).step_by(3) {
        if sim.alive[i] == 0 || sim.stun[i] > 0.0 {
            continue;
        }
        let ui = sim.soldier_unit[i] as usize;
        // Couching the lance is part of beginning the GALLOP, not a
        // melee-range weapon pick. The grind weapon-swap below only runs once
        // a foe is within DISENGAGE_DIST (6m) — so without this a charging
        // lancer kept his sidearm in hand for the whole approach and only
        // drew the lance AT contact (visibly wrong, and the couched point
        // never carried). Decide the charge weapon here, above the proximity
        // gates, keyed purely on charge state: the instant the burst opens
        // (~50m out) every rider levels his lance, and holds it until it
        // SNAPS on a man (charge_wpn_spent) or the charge bogs (charging
        // drops). No fumble cooldown — the lance comes down with the gallop.
        if sim.units[ui].charging && !sim.charge_wpn_spent[i] {
            if let Some(ci) = sim.units[ui]
                .stats
                .weapons
                .iter()
                .position(|w| w.is_charge())
            {
                sim.cur_weapon[i] = ci as u8;
                sim.switch_cd[i] = 0.0;
            }
        }
        if !near_enemy[ui] {
            sim.target[i] = -1;
            sim.fighting[i] = 0;
            sim.fight_near[i] = 0;
            sim.front_clear[i] = 1;
            sim.nearest_enemy_d[i] = f32::MAX;
            sim.nearest_enemy[i] = -1;
            continue;
        }
        let disengaged = sim.units[ui].mode == OrderMode::Disengage || sim.units[ui].routing;
        let stats = sim.units[ui].stats;
        let weapons = stats.weapons;
        let max_reach = weapons.iter().map(|w| w.reach).fold(0.0f32, f32::max);
        let p = sim.soldier_pos(i);
        let local_f = dir(sim.facings[i]);
        let local_r = local_f.perp();
        // Targeting strike field (slice 01): a man targets the foe he can bring
        // his blade to bear on SOONEST (cost = turn-to-edge + travel), not the
        // nearest body. The field is the GRIND weapon's zones (the widest-arc
        // melee blade, never the one-phase lance): for a mounted sabre that is
        // the flank lobes, so the seek DISPERSES riders across the front (the
        // wide knockdown swath of a charge) and onto flank foes it can cut, not
        // bunched on one foe dead-ahead. The lance spits forward independently
        // (its strike reads its own front lobe, below). Foot ignores this field:
        // its turn cost is gated off, so its cost is pure distance ≈ nearest.
        let grind = weapons
            .iter()
            .filter(|w| !w.is_charge())
            .max_by(|a, b| a.zones.swing_arc().total_cmp(&b.zones.swing_arc()))
            .copied()
            .unwrap_or(weapons[0]);
        let tgt_field = crate::strike::field(
            grind.zones,
            grind.min_range,
            grind.reach,
            1.0,
            AIM_TOLERANCE,
        );
        // Cost in METRES: the surface gap plus the wheel converted to the
        // distance it would cover (turn_to_edge/turn_rate * approach_speed,
        // below). Both are lengths, so they weight themselves; foot pays only
        // the gap (its turn term is gated off — see the mounted check below).
        let turn_rate = (tun.soldier_turn_rate * stats.turn_mult).max(0.1);
        let approach_speed = (tun.run_speed * stats.pace_mult).max(0.5);

        let Some(targeting) = find_target(
            sim,
            TargetSearch {
                i,
                ui,
                cell,
                max_reach,
                p,
                local_f,
                local_r,
                disengaged,
                tgt_field,
                turn_rate,
                approach_speed,
            },
        ) else {
            continue;
        };
        let Targeting {
            nearest,
            nearest_d,
            t_bearing,
            candidates,
            cand_len,
            friends,
            friends_len,
        } = targeting;

        // --- weapon by judgment (distance), or the unit's drawn order ---
        // A braced weapon (the sarissa) is held by DEFAULT, leveled down the
        // unit's frontage. It can only bear on a foe inside its arc of that
        // frontage — you can't pivot a grounded pike in the ranks. So: keep
        // the pike unless a foe the pike CAN'T take (too close, or off the
        // front) is within side-arm reach — then draw the sword; the moment
        // nobody is in sword reach, fall back to the leveled pike. This is the
        // one source of truth for what's in hand: the renderer draws it, and
        // the IMPALE below only fires while the pike is up.
        let front_off = wrap_angle(t_bearing - sim.units[ui].facing).abs();
        let desired = if let (Some(ci), Some(gi)) = (
            weapons.iter().position(|w| w.is_charge()),
            weapons.iter().position(|w| !w.is_charge()),
        ) {
            // CHARGE vs GRIND: a horseman's two weapons are for two phases. While
            // the charge still carries momentum he fights the CHARGE weapon (the
            // lance) — long, couched, taken at speed as the mass plows through.
            // The instant the charge is spent and it's a standing melee, he drops
            // to his GRIND sidearm (the wide-arc sword) — which is where a stalled
            // charge earns most of its kills. Gating on CHARGE STATE (not aim or
            // reach) is what lets the lance plow without stopping to fence, and
            // keeps the sword for the press where the narrow lance is useless.
            // HYSTERESIS around the spent/charge speeds: the mass speed jitters in
            // a grind, so latch on what's in hand — keep the lance only while the
            // charge still carries (> spent), and once on the sword don't redraw
            // the lance for a stray jostle, only a fresh full-speed charge
            // (> charge_min). Without this the weapon thrashes every tick and the
            // rider spends the fight switching instead of swinging.
            // The lance is couched ONLY for an actual charge: hold it while the
            // unit is charging (the `charging` latch carries its own hysteresis,
            // set on the gallop and dropped when it bogs) and this rider's lance
            // hasn't yet SNAPPED on a man. A walk-in never charges, so it fights
            // the sword from the start — no lance kills without a gallop. Once
            // bogged or spent, the sabre, where a stalled charge earns its grind.
            let keep_charge = !sim.charge_wpn_spent[i] && sim.units[ui].charging;
            Some(if keep_charge { ci } else { gi })
        } else if let Some(bi) = weapons.iter().position(|w| w.hedge()) {
            let pike = &weapons[bi];
            // The pike is leveled down the UNIT's frontage and braced there; a
            // man can only drive it while he is himself SQUARED UP to that line.
            // If he has turned his body off the frontage to meet a man on his
            // flank, the long shaft is useless to him sideways — he drops to his
            // side-arm. So the pike bears only when (a) the foe is in the
            // frontage arc AND (b) the soldier still faces along it.
            let self_off = wrap_angle(sim.facings[i] - sim.units[ui].facing).abs();
            let pike_bears = front_off <= pike.zones.primary_half() + AIM_TOLERANCE
                && self_off < FRONT_ARC
                && nearest_d >= pike.min_range
                && nearest_d <= pike.reach;
            if pike_bears {
                Some(bi)
            } else if let Some(si) = weapons.iter().position(|w| !w.hedge()) {
                // a foe the pike can't take: sword if it's in reach, else hold
                // the pike leveled to the front (the default)
                if nearest_d <= weapons[si].reach {
                    Some(si)
                } else {
                    Some(bi)
                }
            } else {
                Some(bi)
            }
        } else {
            pick_weapon_index(&weapons, nearest_d)
        };
        let Some(desired) = desired else {
            continue; // enemy inside every min_range and outside sidearms
        };
        // Swapping weapons takes a moment of fumbling — no strikes
        // mid-swap. (This is the pike line's vulnerability when closed
        // on: a second of helplessness while the side swords come out.)
        if sim.switch_cd[i] > 0.0 {
            sim.switch_cd[i] -= 3.0 * DT;
            if sim.switch_cd[i] <= 0.0 {
                sim.cur_weapon[i] = desired as u8;
            }
            continue;
        }
        if desired as u8 != sim.cur_weapon[i] {
            sim.switch_cd[i] = 1.0;
            continue;
        }
        let weapon = &weapons[sim.cur_weapon[i] as usize];
        // The weapon in hand must actually bear on the target.
        if nearest_d < weapon.min_range || nearest_d > weapon.reach {
            continue;
        }
        // A braced weapon aims along the UNIT's frontage (a grounded sarissa
        // can't be turned in the ranks); everything else tracks the man's own
        // facing as he squares up. Used by the aim gate, the obstruction
        // check, and the swing alike.
        let aim_facing = if weapon.hedge() {
            sim.units[ui].facing
        } else {
            sim.facings[i]
        };

        let attack = Attack {
            i,
            ui,
            nearest,
            p,
            aim_facing,
            weapon,
            tun: &tun,
        };
        apply_impale(sim, &attack);
        resolve_swing(
            sim,
            &attack,
            SwingNeighborhood {
                gang_rank: gang_rank[i],
                candidates: &candidates,
                cand_len,
                friends: &friends,
                friends_len,
            },
        );
    }

    apply_staged_damage(sim, n);
}
