# Slice 07 — Tick-rate / frame decoupling (product fallback)

## Contract unlocked

The frame loop stops death-spiraling when a tick overruns: sim Hz and render
Hz are explicitly decoupled with a bounded catch-up policy, and the product
decision about what 30k battles FEEL like at the chosen sim rate is made
deliberately (investigation rec #7: this protects frame time; it does not make
a tick cheaper).

## Scope guardrails

- This is the web loop + `Battle`/`game-wasm` stepping policy — near the sim
  but must not change what one tick computes.
- A lower effective sim Hz changes battle dynamics unless retuned — that
  decision is DAVID'S, made on vibes at the candidate rate, not implied by a
  loop refactor. Fixed-step scheduling stays deterministic (same seed + same
  tick count → same state).
- Renderer interpolation between sim states (if introduced) is presentation
  only and belongs to the renderer spec's domain — coordinate, don't smuggle.

## Verification

- Determinism harness: seed + tick-count reproducibility unchanged.
- A stall-injection check: an artificially slow tick must not cascade
  (bounded catch-up, no spiral) — the 04f finding's 164 ms/frame case is the
  regression fixture.
- Vibes at the shipped rate if the effective Hz changed — David checkpoint
  (non-blocking per house style).

## Must stay green

`cargo test --workspace`; the renderer's standing gates (this slice touches
the loop the perf gate times).
