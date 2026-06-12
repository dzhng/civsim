//! Core battle simulation. Pure logic — no wasm or browser dependencies,
//! so everything here is testable natively with `cargo test`.
//!
//! Architecture: the player issues *intent* (orders). Each unit's formation
//! controller realizes that intent over time, rate-limited by cohesion.
//! Cohesion is *measured* from physical soldier state (slot error), never
//! stored as an independent scalar that could drift from reality. The same
//! principle governs every system: read and write the physical state, so
//! mechanics interact emergently instead of through stat couplings.
//!
//! Soldier state lives in structure-of-arrays Vecs so the wasm layer can
//! expose raw pointers for zero-copy rendering.

pub mod ai;
pub mod battle;
pub mod class;
pub mod collision;
pub mod combat;
pub mod grid;
pub mod maps;
pub mod math;
pub mod missiles;
pub mod morale;
pub mod path;
pub mod movement;
pub mod rng;
pub mod runner;
pub mod sim;
pub mod terrain;
pub mod tunables;
pub mod unit;

pub use ai::ai_commander;
pub use battle::{deploy_roster, setup_battle, setup_duel, setup_sandbox};
pub use runner::Battle;
pub use class::{class_stats, UnitClass, UnitClassId, Weapon};
pub use grid::SpatialHash;
pub use maps::{build as build_map, MapId, MAP_HALF_H, MAP_HALF_W};
pub use math::{dir, lerp, move_toward, rotate_toward, wrap_angle, Vec2};
pub use missiles::{missile_spec, MissileKind, Projectiles};
pub use rng::Pcg32;
pub use sim::Sim;
pub use terrain::{micro_rough, Terrain};
pub use tunables::{Pace, Tunables, DT};
pub use unit::{OrderMode, Stance, Unit};
