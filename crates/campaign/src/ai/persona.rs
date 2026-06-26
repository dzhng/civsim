//! Personas as presets, not code paths. Every faction runs the same search; a
//! persona only changes the dials it runs with — what it values (`eval::Weights`),
//! how clear an edge it demands before attacking (`gate`), and how cold or
//! erratic its choices are (`select_scale`, `bravado_aggro`). That's what makes
//! a turtle, a merchant, and a warmonger feel different while sharing one brain.

use super::eval::Weights;
use crate::mapdata::AiPersona;
use crate::tunables as tun;

/// The dials a persona runs the commander's search with.
#[derive(Clone, Copy, Debug)]
pub struct Profile {
    /// What the faction optimizes when it scores a rolled-forward position.
    pub weights: Weights,
    /// Attack threshold as a percentage of the defenders' strength: 130 = needs
    /// a 1.3× edge before a city counts as "beatable". Higher = more cautious.
    pub gate: u64,
    /// Softmax temperature for picking among plans: low = cold/near-argmax,
    /// high = erratic.
    pub select_scale: f64,
    /// How hard the bravado mood swings an offensive plan's score.
    pub bravado_aggro: f64,
}

/// The preset for each persona. Expansionist (and unused Neutral) reproduce the
/// pre-persona defaults exactly, so existing maps play identically.
pub fn profile(p: AiPersona) -> Profile {
    use AiPersona::*;
    match p {
        Expansionist | Neutral => Profile {
            weights: Weights::default(),
            gate: 130,
            select_scale: tun::AI_SELECT_SCALE,
            bravado_aggro: tun::AI_BRAVADO_AGGRO,
        },
        // Turtle: cities and their safety dominate; demands a big edge before it
        // marches, and chooses coolly. Emergent defensiveness — a plan that
        // leaves a city exposed scores badly under the heavy threat weight.
        Defensive => Profile {
            weights: Weights {
                territory: 60_000.0,
                army: 1.0,
                income: 30.0,
                threat: 3.0,
            },
            gate: 180,
            select_scale: 8_000.0,
            bravado_aggro: 20_000.0,
        },
        // Builder: prizes income above army, holds back from early fights.
        Mercantile => Profile {
            weights: Weights {
                territory: 50_000.0,
                army: 0.8,
                income: 90.0,
                threat: 1.5,
            },
            gate: 160,
            select_scale: 10_000.0,
            bravado_aggro: 25_000.0,
        },
        // Jackal: will only commit when it massively outmatches the defenders,
        // and is averse to leaving itself open — so it picks on the weak.
        Opportunist => Profile {
            weights: Weights {
                territory: 50_000.0,
                army: 1.2,
                income: 30.0,
                threat: 2.0,
            },
            gate: 220,
            select_scale: tun::AI_SELECT_SCALE,
            bravado_aggro: tun::AI_BRAVADO_AGGRO,
        },
        // Cold engine: a modest edge is enough, and it nearly always takes the
        // best-scoring plan — little randomness, mood barely registers.
        Calculating => Profile {
            weights: Weights::default(),
            gate: 150,
            select_scale: 3_000.0,
            bravado_aggro: 10_000.0,
        },
        // Brave to a fault: attacks at parity, shrugs off exposure, and its
        // swingy mood + hot temperature make it unpredictable.
        Warmonger => Profile {
            weights: Weights {
                territory: 50_000.0,
                army: 1.5,
                income: 20.0,
                threat: 0.4,
            },
            gate: 100,
            select_scale: 30_000.0,
            bravado_aggro: 70_000.0,
        },
    }
}
