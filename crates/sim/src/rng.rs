//! Re-export: Pcg32 lives in the `contract` crate (the campaign needs the
//! same deterministic, serializable RNG). All internal paths are unchanged.

pub use contract::Pcg32;
