# 22 — sim-primitives

**Contract unlocked:** three tiny owners exist and the golden hash proves each
is a pure move.

## Seam

- `crates/sim/src/math.rs`: `impl Vec2 { pub fn perp(self) -> Vec2 { Vec2::new(self.y, -self.x) } }`
  replacing the 12-15 inline `Vec2::new(f.y, -f.x)` sites in `sim.rs`,
  `battle.rs`, `unit.rs`. All are right-hand; confirm each before replacing.
- `fn covered_fighting_files(u: &Unit, fighting: &[bool], soldier_slot: &[usize]) -> Vec<bool>`
  replacing the duplicated loop at `sim.rs:1115-1125` and `1906-1916`.
- `crates/sim/src/genmap/noise.rs`: `mix64`, `hash01`, `hash_cell01`,
  `smoothstep`, and the two differently-behaved functions currently both
  named `value_noise`, renamed by behaviour: `value_noise_nearest`
  (`field_texture.rs:236`) and `value_noise_bilinear` (`landform.rs:313`, with
  its derivative variant). `campaign/src/battlegen.rs:91 splitmix64` is a
  different crate; leave it, note it.

## Decisions resolved here

Names above. No arithmetic reordering.

## Delegated to the implementer

None.

## Verification

- G-infra: `golden_state_hash_stable` identical. `cargo test -p sim --test genmap`
  terrain hashes identical.
- G0, G-mech.

## Must stay green

Everything; the hash is the proof.

## Feedback that would change this slice

None.
