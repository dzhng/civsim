use super::*;

/// Apply every blow dealt this tick together, preserving mutual strikes.
pub(super) fn apply_staged_damage(sim: &mut Sim, n: usize) {
    // --- Jacobi apply: every blow dealt this tick lands now, together. ----
    // Deaths resolve only here, so within a tick no strike is cancelled by an
    // earlier one in index order — the mutual blows of a head-on clash are
    // mutual, which is what makes the engine M-equivariant.
    for v in 0..n {
        if sim.alive[v] == 0 {
            continue;
        }
        // Shove first (a survivor's bonds must reflect the displacement before
        // next tick reads crush; a corpse needs no update).
        let (sx, sy) = (sim.push_acc[2 * v], sim.push_acc[2 * v + 1]);
        if sx != 0.0 || sy != 0.0 {
            let np = Vec2::new(sim.positions[2 * v] + sx, sim.positions[2 * v + 1] + sy);
            if sim.terrain.speed_at(np) > 0.0 {
                sim.positions[2 * v] = np.x;
                sim.positions[2 * v + 1] = np.y;
                #[cfg(feature = "force-trace")]
                sim.force_trace.push(ForceRecord::new(
                    sim.tick_count,
                    v,
                    sim.soldier_unit[v] as usize,
                    ForceChannel::HitPush,
                    Vec2::new(sx, sy),
                    "jacobi_hit_push_apply",
                ));
            }
        }
        // Label a melee kill charge vs grind by where the wound came from:
        // if at least half the staged damage was charge-driven (lance still
        // carrying, or a charge-impale) it is a charge kill, else the grind.
        let melee_cause = {
            let total = sim.mount_dmg_acc[v] + sim.dmg_acc[v];
            if total > 0.0 && sim.dmg_from_charge[v] * 2.0 >= total {
                KillCause::ChargeMelee
            } else {
                KillCause::GrindMelee
            }
        };
        if sim.mount_dmg_acc[v] > 0.0 {
            sim.mount_health[v] -= sim.mount_dmg_acc[v];
            if sim.mount_health[v] <= 0.0 {
                sim.kill_with(v, melee_cause);
                continue;
            }
        }
        if sim.dmg_acc[v] > 0.0 {
            sim.health[v] -= sim.dmg_acc[v];
            if sim.health[v] <= 0.0 {
                sim.kill_with(v, melee_cause);
            }
        }
    }
    sim.has_fighting = sim.fighting.contains(&1);
}
