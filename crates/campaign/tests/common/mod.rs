#![allow(dead_code)]

use campaign::tunables as tun;
use campaign::Campaign;

pub fn inert(c: &mut Campaign) {
    for f in &mut c.state.factions {
        f.ai = false;
    }
}

/// Drive the campaign `ticks` ticks the way the harness does: the commander AI
/// runs at its dispatch cadence (`drive_ai`) and any battle that comes due is
/// resolved the cheap way (`resolve::estimate`). One place wires the AI for
/// every behaviour test. Returns the number of battles fought.
pub fn run_ai(c: &mut Campaign, ticks: u32) -> u32 {
    let mut battles = 0;
    for _ in 0..ticks {
        c.tick();
        if c.state.tick % tun::AI_DISPATCH_EVERY == 0 {
            c.drive_ai();
        }
        if let Some(eid) = c.state.battle_ready {
            match c.battle_setup(eid) {
                Some(setup) => {
                    let r = campaign::resolve::estimate(&c.map, &setup);
                    c.apply_outcome(eid, &r);
                    battles += 1;
                }
                None => c.state.battle_ready = None,
            }
        }
    }
    battles
}

pub fn test_map() -> &'static str {
    include_str!("../fixtures/test-map.json")
}
