use super::*;

pub(super) struct Attack<'a> {
    pub(super) i: usize,
    pub(super) ui: usize,
    pub(super) nearest: i32,
    pub(super) p: Vec2,
    pub(super) aim_facing: f32,
    pub(super) weapon: &'a Weapon,
    pub(super) tun: &'a crate::tunables::Tunables,
}

pub(super) struct SwingNeighborhood<'a> {
    pub(super) gang_rank: u16,
    pub(super) candidates: &'a [(u32, f32, f32); 12],
    pub(super) cand_len: usize,
    pub(super) friends: &'a [Option<NearbyFriend>; MAX_NEARBY_FRIENDS],
    pub(super) friends_len: usize,
}

pub(super) fn resolve_swing(
    sim: &mut Sim,
    attack: &Attack<'_>,
    neighborhood: SwingNeighborhood<'_>,
) {
    let Attack {
        i,
        ui,
        nearest,
        p,
        aim_facing,
        weapon,
        tun,
    } = *attack;
    let SwingNeighborhood {
        gang_rank,
        candidates,
        cand_len,
        friends,
        friends_len,
    } = neighborhood;
    // --- swing when ready and roughly aligned ------------------------
    sim.attack_cd[i] -= 3.0 * DT;
    if sim.attack_cd[i] > 0.0 {
        return;
    }
    // GANG CAP: a foe already crowded by gang_cap comrades leaves no room
    // for this man's blade to WOUND — but he still swings and SHOVES (the
    // push that holds the contact line apart), so the front neither blobs
    // nor loses the standoff; only the gang's DAMAGE is capped.
    let can_wound = gang_rank < tun.gang_cap;
    let facing = aim_facing;
    // The aim gate: a man holds his swing until his weapon bears. A foot
    // blade gates on the seek TARGET (he is facing it); a flank SABRE never
    // gates here (the resolve picks whoever is in its side lobes). A couched
    // LANCE is the exception: it spits whatever is dead-ahead REGARDLESS of
    // where the rider's dispersed seek points (the seek scatters riders for
    // the wide knockdown swath), so it gates on the closest foe in its OWN
    // front lobe — else it whiffs every time the unit hunts a flank foe.
    if weapon.is_charge() {
        let lance = crate::strike::field(
            weapon.zones,
            weapon.min_range,
            weapon.reach,
            1.0,
            AIM_TOLERANCE,
        );
        let bears = (0..cand_len).any(|k| {
            let (v, d, b) = candidates[k];
            sim.alive[v as usize] == 1 && lance.contains(wrap_angle(b - facing).abs(), d)
        });
        if !bears {
            return;
        }
    } else if !weapon.zones.is_flank() {
        let target_p = sim.soldier_pos(nearest as usize);
        let aim = wrap_angle((target_p - p).y.atan2((target_p - p).x) - aim_facing);
        if aim.abs() > weapon.zones.primary_half() + AIM_TOLERANCE {
            return;
        }
    }

    // Obstruction: friendly bodies inside THIS weapon's swing envelope
    // (their subtended angle widens up close). Thrusts (tiny arc)
    // thread past comrades' shoulders — that's why pikes work in
    // ranks; sweeps need clearance, so wide arcs choke in a press.
    let swing = weapon.zones.swing_arc();
    let arc_weight = swing / (swing + 0.5);
    let crowded = friends[..friends_len]
        .iter()
        .flatten()
        .filter(|f| {
            let off = wrap_angle(f.bearing - aim_facing).abs();
            f.distance < weapon.reach * 0.9
                && off < weapon.zones.primary_half() + (0.7 / (f.distance + 0.5)).atan()
        })
        .count() as f32
        * arc_weight;
    // ...weighted by the VICE: crowding is geometry, the vice is
    // what stops you working around it. A man shoved from ONE side
    // yields a step and times his sweep between shoulders; a man
    // wedged between opposing masses has his elbows pinned. This is
    // also one-sided crush working as intended: compressing an
    // enemy chokes THEIR swings without choking the free-standing
    // men doing the crushing.
    let net = (sim.press_x[i] * sim.press_x[i] + sim.press_y[i] * sim.press_y[i]).sqrt();
    let vice = (sim.pressure[i] - net).max(0.0);
    let pinned = (vice / VICE_PIN).clamp(0.0, 1.0);
    let obstruct = crowded * (OBSTRUCT_FLOOR + (1.0 - OBSTRUCT_FLOOR) * pinned);
    // Swing cadence SLOWS with fatigue: a spent attacker's interval
    // stretches toward base / stamina_cadence_floor. This is the offence-
    // RATE half of fatigue (paired with the softer blow, stamina_damage_floor,
    // and the collapsing guard). It is BOUNDED by the floor — an earlier
    // unbounded version made grinds CRAWL (a spent line swung ever slower and
    // never resolved); at the gentle 0.75 floor it's ~1.33× the interval, a
    // real ~25% rate drop that still lets the fight resolve.
    let cadence = tun.stamina_cadence_floor
        + (1.0 - tun.stamina_cadence_floor) * stamina_factor(sim.units[ui].stamina);
    let interval = weapon.attack_interval * (1.0 + 0.35 * obstruct) / cadence;
    sim.attack_cd[i] = interval;

    // --- resolve the swing ------------------------------------------------
    // The arc is the FIELD OF WHO YOU CAN HIT, not a sweep. A normal weapon
    // strikes the CLOSEST foe in that field — one man per stroke. Only a
    // CLEAVE weapon (the wide two-hander) hits everyone in the field. The
    // field is the front arc for foot; for a mounted SABRE it is the two
    // flank lobes (the horse's head and croup are blind).
    let m_a = sim.mass[i] * sim.units[ui].brace();
    // The strike FIELD: the weapon's zones, with the FRONT lobe crowd-
    // narrowed by `1 + obstruct` so a choked sweep shrinks its cone (a
    // flank sabre's lobes are fixed). Reach and the front/flank geometry
    // fold in, so the resolve below is one `contains`.
    let field = crate::strike::field(
        weapon.zones,
        weapon.min_range,
        weapon.reach,
        1.0 + obstruct,
        AIM_TOLERANCE,
    );
    if weapon.cleave {
        let mut struck = 0usize;
        for &(v, d_surf, bearing) in candidates.iter().take(cand_len) {
            if struck >= MAX_VICTIMS {
                break;
            }
            let v = v as usize;
            if sim.alive[v] != 1 {
                continue;
            }
            if !field.contains(wrap_angle(bearing - facing).abs(), d_surf) {
                continue;
            }
            struck += 1;
            sim.strike(i, v, weapon, bearing, m_a, can_wound, tun);
        }
    } else {
        // closest foe in the field gets the one stroke
        let mut best: Option<usize> = None;
        let mut best_d = f32::MAX;
        for (k, &(v, d_surf, bearing)) in candidates.iter().enumerate().take(cand_len) {
            if d_surf >= best_d || sim.alive[v as usize] != 1 {
                continue;
            }
            if field.contains(wrap_angle(bearing - facing).abs(), d_surf) {
                best_d = d_surf;
                best = Some(k);
            }
        }
        if let Some(k) = best {
            let (v, _, bearing) = candidates[k];
            sim.strike(i, v as usize, weapon, bearing, m_a, can_wound, tun);
        }
    }
}

pub(super) fn apply_impale(sim: &mut Sim, attack: &Attack<'_>) {
    let Attack {
        i,
        ui,
        nearest,
        p,
        aim_facing,
        weapon,
        tun,
    } = *attack;
    // IMPALE — a PRESENTED point, before any swing: a body closing
    // at charge grade onto a planted pole spends its own momentum
    // on the point, every tick it is in reach (presentation is
    // free; only thrusting has a cadence — this is how a hedge
    // stops horses at reach, BEFORE the bodies meet and the
    // knockdown storm flattens the front rank). Reach is the
    // physics: a pole braces to grip, rear hand, ground; a sword
    // absorbs and deflects. Closing reads kin_* (measured motion,
    // never position deltas — the phantom door stays shut).
    {
        let planted = ((weapon.reach - 1.0) / 2.2).clamp(0.0, 1.0);
        let target_p = sim.soldier_pos(nearest as usize);
        let aim = wrap_angle((target_p - p).y.atan2((target_p - p).x) - aim_facing).abs();
        // HEDGE depth: a wall is points DEEP. The stop is the
        // per-point leverage (reach², `planted²`) times the
        // fraction of the reach-deep hedge that is actually manned
        // — a sarissa block projects ~3 ranks of points, a thin
        // line one. So a deep phalanx walls horse, a 2-deep pike
        // file merely pricks it, and a short spear can never build
        // a hedge its reach can't reach. (Bounded to 1: a hedge
        // never returns MORE than its full depth.)
        let hedge = {
            let pu = &sim.units[ui];
            let ranks = pu.alive_count as f32 / pu.files_eff.max(1) as f32;
            let spacing = pu.stats.spacing.y.max(0.5);
            let reach_ranks = (weapon.reach / spacing).max(1.0);
            (ranks / reach_ranks).clamp(0.0, 1.0)
        };
        // A grounded/braced point is locked to the formation frontage:
        // it can stop what is presented to the formation's FRONT cone,
        // not a flank/rear charge. This is deliberately broader than
        // the thrust's damage arc: adjacent points overlap into a hedge
        // for charge-stopping, while the later swing gate remains
        // narrow.
        // Mobile long weapons (lances, long swords) are not a fixed
        // hedge; keep their existing charge-presentation behavior.
        let hedge_bears = aim <= 1.25;
        if planted > 0.0 && (!weapon.hedge() || hedge_bears) {
            let v = nearest as usize;
            let p = sim.soldier_pos(i);
            let tp = sim.soldier_pos(v);
            let to = tp - p;
            let l = to.len().max(0.1);
            let d = to * (1.0 / l);
            let kin = Vec2::new(sim.kin_vx[v], sim.kin_vy[v]);
            let closing = (-(kin.dot(d))).max(0.0);
            // Charge-grade gate for men (slow infantry pressers pay
            // nothing extra — the deep-pike contract); a TRAMPLING
            // body feeds itself onto the point at ANY speed — a
            // horse has no shield to put between itself and a pike.
            let vu = sim.soldier_unit[v] as usize;
            let gate = if sim.units[vu].tramples() {
                0.5
            } else {
                tun.charge_min_speed
            };
            if closing > gate {
                let w_i = sim.mass[i] * sim.units[ui].brace();
                let share = w_i / (w_i + sim.mass[v]);
                let stop = closing * DT * share * planted * planted * hedge * 8.0;
                let np = Vec2::new(
                    sim.positions[v * 2] + d.x * stop,
                    sim.positions[v * 2 + 1] + d.y * stop,
                );
                if sim.terrain.speed_at(np) > 0.0 {
                    sim.positions[v * 2] = np.x;
                    sim.positions[v * 2 + 1] = np.y;
                }
                // ...and the point bleeds the carried glide itself.
                let toward = -(sim.mom_x[v] * d.x + sim.mom_y[v] * d.y);
                if toward > 0.0 {
                    let grip = (share * planted * planted * hedge * 0.8).min(0.45);
                    sim.mom_x[v] += d.x * toward * grip;
                    sim.mom_y[v] += d.y * toward * grip;
                }
                if weapon.impales && sim.units[vu].tramples() {
                    // A horse feeding itself onto a presented point pays
                    // in flesh as well as momentum. This is not a swing
                    // (no cadence, block, or flourish): it is the
                    // mounted body doing the work by closing onto the
                    // braced shaft. Off-axis/flank charges are already
                    // excluded by `hedge_bears` above.
                    let dmg = weapon.damage
                        * (closing / tun.charge_min_speed.max(0.1)).clamp(0.0, 2.0)
                        * planted
                        * hedge
                        * DT
                        * 6.0;
                    // Charge-impale: a body run onto a braced point — its
                    // whole wound is charge-driven (closing-speed scaled). It
                    // reads the SAME capped rider/chest split as the standing
                    // grind (one rule for the front): a long pike spans toward
                    // the rider, a short point bloodies the hide, and the
                    // horse's bulk always shields part of the man (the 0.65
                    // cap), so the impale never instantly removes every lead
                    // horse. The lead horses that DO die open a gap the ranks
                    // behind charge into — a determined charge breaks through.
                    // That is the intent: no impenetrable wall, only a toll.
                    let exp = rider_exposure_frontal(weapon.reach);
                    sim.dmg_from_charge[v] += dmg;
                    sim.dmg_acc[v] += dmg * exp;
                    sim.mount_dmg_acc[v] += dmg * (1.0 - exp);
                }
            }
        }
    }
}
