# Slice 1 — `compact_columns`: the forward-only, file-fixed closer

## Contract this unlocks

A pure function that closes casualty holes **down each column**: every living
man keeps his file; vacancies in a file are closed by the men behind stepping
forward; an emptied file is left empty. No man ever changes file → zero
reassignment-driven lateral motion. Lands as substrate — it is NOT called by the
sim yet, so this slice changes no live behaviour.

## API seam

`crates/sim/src/unit.rs`, mirroring the signature of the function it will
replace (`compact_slots_preserving_order`, `unit.rs:405`):

```rust
/// Close casualty holes FORWARD within each file: a man keeps his column
/// (slot % files_eff); the living in a file pack into ranks 0,1,2,… of that
/// same file; an emptied file leaves its slots vacant. The only formation
/// closing that produces purely forward motion — used while a unit fights, so
/// the back lines never crab sideways to backfill. Lateral re-evening is
/// `reassign_slots`'s job, run only on disengage/reform.
pub(crate) fn compact_columns(u: &Unit, alive: &[u8], soldier_slot: &mut [u32]) {
    let files = u.files_eff.max(1);
    // bucket living men by current file, ordered by current rank then soldier
    // index (deterministic tiebreak — NEVER position noise; see golden contract)
    // then for each file, rewrite ranks to 0,1,2,…  keeping the same file column.
}
```

- **Inputs / ownership:** reads `u.files_eff`, `u.start`, `u.count`, the `alive`
  flags, and the *current* `soldier_slot` (to read each man's file/rank); writes
  `soldier_slot` in place for this unit's range only.
- **Data shape:** operates entirely on slot indices (`file = slot % files_eff`,
  `rank = slot / files_eff`). It does **not** read `positions` — a man's column
  is his slot identity, not where he has been physically shoved. (This is what
  makes it lateral-free and push-resistant: the weave will pull a shoved man back
  into his file.)
- **Determinism:** sort key is `(rank, soldier_index)`. No floats, no RNG, no
  fidget offset needed (unlike `reassign_slots`, which sorts on world position).
  Idempotent: running it twice equals running it once.

## What the human can run

`cargo test -p sim --test mechanics_formation` (new file) — fast. The tests read
`sim.soldier_slot` / `sim.units` (both `pub`) and decode files/ranks the same way
`mechanics_weave.rs` already does (`slot % files`, `slot / files`,
`mechanics_weave.rs:422-424`). Reuse its `block(files, ranks, spacing)` and
`kill_to` helpers (`mechanics_weave.rs:244, 351`) — or lift them into
`tests/common`.

## Tests that pin it (mechanics_*, immortal fakes)

Build a clean `block(files, ranks)`, call `compact_columns` directly (it is
`pub(crate)`, so the test goes in the `sim` crate or uses a thin test hook —
prefer asserting through a `#[cfg(test)]` re-export or testing the wired
behaviour in slice 2 if crate-privacy bites; note the choice here):

1. **Front death pulls the file up.** Kill the rank-0 man of file `f`. Assert
   every surviving man in file `f` keeps `slot % files == f` and his rank
   decreased by exactly 1; **no man in any other file changed slot at all.**
2. **Mid-column death moves only those behind.** Kill a rank-`k` man. Men in the
   same file with rank `< k` are untouched; men with rank `> k` move up one;
   other files untouched.
3. **A wiped file stays empty.** Kill every man in file `f`. No other man's slot
   changes; files `≠ f` are untouched (the frontage notch is real).
4. **No man ever changes file** — across any combination of kills, for every
   living `i`: `new_slot % files == old_slot % files`.
5. **Deterministic + idempotent.** Same kills → same `soldier_slot`; a second
   `compact_columns` call is a no-op.

## What must stay green

Nothing live changes — the whole existing suite is unaffected because the
function is unwired. (Sanity: `cargo build -p sim` and the new test file only.)

## Feedback that would change this slice

- If crate privacy makes direct unit-testing awkward, David may prefer the
  primitive be proven only through slice 2's wired behaviour test instead of a
  test hook — pick the lower-ceremony path and record it in the README.
- If `compact_columns` turns out to subsume `reassign_slots`'s partial-rank
  "keep nearest lateral files" intent well enough that the two could share code,
  note it — but do not refactor `reassign_slots` here; that is slice 2's call.
