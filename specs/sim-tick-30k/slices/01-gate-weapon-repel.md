# Slice 01 — Proximity-gate `collision.weapon_repel` (pure-perf)

## Contract unlocked

The single cheapest big win (investigation rec #1): the weapon-reach repel scan
runs only where a repel could possibly apply. Measured cost today: ~14.7 ms/tick
at 30k IDLE (59.9% of the idle tick), ~14.8 ms at 30k fighting.

## Approach (from the investigation; verify against current code)

Compute a conservative per-unit active set before scanning: unit extent + max
weapon reach + safety pad vs nearest-enemy distance, from deterministic
positions in stable unit order. Inside the active set, iteration order and
candidate handling stay EXACTLY as today. The pad must provably cover every
case where a repel can affect an enemy — err generous; the win comes from
far-apart formations, not from shaving the engaged front.

## Verification

- **State-hash golden: bit-identical** across the slice-00 seed set, idle AND
  fighting (fighting has engaged fronts where the gate must not change
  anything).
- Bench: record the ledger row (expect idle ~24.5 → ~10; fighting improves by
  the disengaged fraction). Budget gate re-run (may still be red — fine).
- `cargo test --workspace`; spot vibe (one standard matchup) unchanged.

## Must stay green

Full suite. If ANY hash or test moves, the gate leaked behavior — fix the pad,
don't re-pin.
