# 28 — campaign-golden

**Contract unlocked:** campaign absolute state is pinned, so the campaign
slices that follow can prove themselves pure moves. Today `randomness.rs:32`
proves A==B only; `save_load.rs`, `rollout.rs`, `orders.rs:8/21`,
`combat_handoff.rs`, `full_game.rs:73` pin fragments, none the whole state.

## Seam

`crates/campaign/tests/golden.rs`: real committed map, fixed seed, 400 ticks
(long enough to cross day boundaries, encounters, and a rout), FNV-1a over
army `(loc, path_idx, progress bits, soldiers, stance)`, city owners,
treasuries, encounter list. Same stacked-comment convention as the sim golden.

## Decisions resolved here

Pinned at HEAD before slice 29 lands. Any later campaign slice that moves it
must say why in the commit and re-pin with a comment line.

## Delegated to the implementer

Tick count and which fields; keep the hash cheap (< 2 s).

## Verification

`cargo test -p campaign --test golden` green twice in a row (determinism).

## Must stay green

Itself.

## Feedback that would change this slice

None.
