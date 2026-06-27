//! The enemy commander: simple and credible, not clever. It issues the same
//! orders a player can (movement intent only — the invariant holds for the
//! AI too) and lets the physics fight.
//!
//! Doctrine: melee line attacks the nearest enemies; cavalry hunts ranged
//! units and exposed flanks once the lines meet; archers walk into range and
//! shoot; screens skirmish on their own reflexes; everyone holds ground when
//! enemies break (no wild pursuits).

use crate::class::UnitClassId;
use crate::sim::Sim;
use crate::unit::OrderMode;

fn is_melee_line(c: UnitClassId) -> bool {
    matches!(
        c,
        UnitClassId::HeavySword
            | UnitClassId::LightSpear
            | UnitClassId::HeavyPhalanx
            | UnitClassId::LongSwords
            | UnitClassId::MediumInfantry
            | UnitClassId::MediumSpear
            | UnitClassId::MediumPhalanx
    )
}

fn is_ranged(c: UnitClassId) -> bool {
    matches!(
        c,
        UnitClassId::Archers | UnitClassId::ArtilleryCrew | UnitClassId::Skirmishers
    )
}

/// Run the commander for `team`. Cheap; call every tick (it thinks at 3s
/// cadence and only re-orders idle units).
pub fn ai_commander(sim: &mut Sim, team: u32) {
    if sim.tick_count % 90 != 0 {
        return;
    }
    let lines_met = sim
        .units
        .iter()
        .any(|u| u.team == team && u.engaged > u.alive_count / 20);

    for ui in 0..sim.units.len() {
        let (class, idle, my_team, center) = {
            let u = &sim.units[ui];
            let idle = !u.routing
                && u.alive_count > 0
                && u.move_target.is_none()
                && u.pending_target.is_none()
                && u.engaged == 0
                && matches!(u.mode, OrderMode::Move);
            (u.class, idle, u.team, u.center())
        };
        if my_team != team || !idle {
            continue;
        }

        // Nearest living enemy, with a class preference for cavalry.
        let mut best: Option<(usize, f32)> = None;
        for (vi, v) in sim.units.iter().enumerate() {
            if v.team == team || v.alive_count == 0 || v.routing {
                continue;
            }
            let mut d = (v.center() - center).len();
            if class == UnitClassId::ShockCavalry && is_ranged(v.class) {
                d *= 0.45; // cavalry smells soft targets
            }
            if best.map_or(true, |(_, bd)| d < bd) {
                best = Some((vi, d));
            }
        }
        let Some((enemy, dist)) = best else {
            continue;
        };

        match class {
            c if is_melee_line(c) => {
                // Two phases, like a human: APPROACH in formation — advance
                // toward the enemy line but halt ~180m short, holding your
                // place in the line — then, once close, pick a target and
                // commit. No premature blobbing onto one enemy unit.
                let run = dist > 380.0;
                sim.set_pace(
                    ui,
                    if run {
                        crate::tunables::Pace::Run
                    } else {
                        crate::tunables::Pace::Walk
                    },
                );
                if dist > 230.0 {
                    let to = sim.units[enemy].center() - center;
                    let goal = center + to * ((dist - 180.0) / dist.max(0.1));
                    sim.set_move_order(ui, goal);
                } else {
                    sim.set_attack_order(ui, enemy);
                }
            }
            UnitClassId::ShockCavalry => {
                if lines_met || dist < 180.0 {
                    sim.set_attack_order(ui, enemy);
                }
            }
            UnitClassId::Archers => {
                // Walk to bow range and stop; fire-at-will does the rest.
                if dist > 130.0 {
                    let to = sim.units[enemy].center() - center;
                    let goal = center + to * ((dist - 110.0) / dist.max(0.1));
                    sim.set_move_order(ui, goal);
                }
            }
            UnitClassId::HorseArchers | UnitClassId::Skirmishers => {
                // Drift toward the enemy; their own evade reflex keeps the
                // kiting band.
                if dist > 90.0 {
                    let to = sim.units[enemy].center() - center;
                    let goal = center + to * ((dist - 60.0) / dist.max(0.1));
                    sim.set_move_order(ui, goal);
                }
            }
            _ => {} // artillery crew holds and shoots
        }
    }
}
