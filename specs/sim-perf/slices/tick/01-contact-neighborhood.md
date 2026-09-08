# tick/01 — Shared per-tick contact neighborhood (pure-perf, highest ordering risk)

## Contract unlocked

The fighting tick's three scans stop rediscovering the same neighbours.
Measured 2026-09-08 in melee (native, self-time): target search
`combat/targeting.rs::find_target` ~35% (an up-to-81-cell scan per soldier
every third tick), the iterative body projection in `separation/walls.rs`
~21% (three Jacobi passes each rebuilding bodies and the grid and rescanning
nine cells per active body), weapon-repel ~13% once engaged (its far-field
cull no longer helps). July's ranking said the same (investigation
recommendations 2 and 3). One per-tick contact neighborhood feeds them.

## Approach guardrails (July's warning, taken seriously)

Target choice, obstruction sampling, weapon-repel and strike resolution are
sensitive to **candidate order and dedup**, especially mounted two-body
soldiers. The shared structure must reproduce the EXACT candidate sequence
each consumer sees today (the bucket walk order, the `seen` dedup, the
strict-less-than tie rule), or that consumer is not shared yet. No hash-map
iteration order may feed a decision. If reproducing a consumer's order
proves impossible without behavior change, SPLIT: share the consumers that
stay hash-identical, record the holdout and why in `choices.md`, and leave
it for the behavior track.

Known exact levers to try first, each provable by the hash:
- The projection passes rebuild `body_pos` and the grid three times; the
  second and third passes can reuse the previous pass's grid when no body
  crossed a cell boundary (check, do not assume).
- The target search's window is clamped to four cells regardless of reach;
  the clamp is pinned behavior, so the saving is in candidate reuse across
  the three soldiers of a phase, not a smaller window.

## Verification

- **State hash bit-identical**: golden test, `profile_tick duels`, and the
  seed-7 `ai` run to 9,000 ticks. This is the slice most likely to fail it —
  treat a mismatch as a wrong candidate order, never as noise.
- Ledger row from tick/00's fixture; the budget gate (this is where ≤ 25 ms
  at 30k fighting should land or come close).
- `cargo test --workspace` plus the full mechanics, scenario and balance
  suites, and one vibe.

## Delegated to the implementer

The neighborhood's representation (per-cell candidate lists vs a per-body
adjacency), and which of the three consumers migrates first (targeting is
the biggest, projection the most self-contained).

## Must stay green

Everything. Re-pinning any test in a pure-perf slice is prohibited.
