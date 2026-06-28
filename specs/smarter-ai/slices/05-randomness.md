# Slice 5 — Human-like randomness

## Contract

The AI stops being a perfect maximizer. Three independent noise knobs, all drawn
from `st.rng` (the in-state `Pcg32`, so a seed still fully determines a run):

1. **Perceived strength** — fuzz strength estimates *inside eval/candidate
   reasoning* so the AI sometimes mis-sizes a fight and commits anyway. Reality
   still resolves on the true `resolve::estimate`. This is the "miscalculated my
   own army / felt brave" effect.
2. **Bravado / mood** — a slowly-drifting per-faction scalar shifting the attack
   threshold (today's hard `1.3x` gate, `ai.rs:301`). Persists across hours so a
   faction runs hot or cautious in streaks, not per-tick jitter.
3. **Selection temperature** — replace slice 4's `argmax` with a `softmax` over
   candidate scores; sample with `st.rng`. Temperature controls how often the AI
   takes the non-optimal-looking plan.

## API seam

- **Perceived strength:** a helper `fn perceive(true_str: u64, rng, sigma) -> u64`
  applied where `think()` / `eval` size up own and enemy armies. `sigma` is a
  small relative noise (e.g. ±15%). Drawn fresh per evaluation.
- **Bravado:** a field on `Faction` (`state.rs`) — `bravado: f32` — nudged each
  diplomacy/think cadence by a small rng walk, clamped to a band. It scales the
  beatable threshold: `astr * bravado > defenders * gate`.
  - Serializable (it's on the state) → determinism preserved, and it shows up in
    saves naturally.
- **Softmax:** `fn pick_softmax(scored: &[(f64, T)], temp: f64, rng) -> &T` in
  `ai/select.rs`. `temp → 0` ≈ argmax; higher = more exploratory.
- New tunables: `AI_PERCEPTION_SIGMA`, `AI_BRAVADO_BAND`, `AI_BRAVADO_DRIFT`,
  `AI_SELECT_TEMP` (defaults; slice 6 overrides per persona).

## What the human can run / see

- Two campaigns from **different** seeds, same map → the AI makes visibly
  different (but each internally sensible) choices. Same seed twice → identical.
- The slice-3 probe, extended to show perceived vs. true strength and the
  softmax probabilities, so the randomness is legible:
  ```
  "nearest-beatable" score 1318 (p=0.52)  perceived own 1.12x true
  ```

## Verifies

- **Determinism held (load-bearing):** fixed seed → byte-identical campaign,
  *with* all three knobs active. The rng must be read in a fixed order; pin it.
- **Variety:** across N seeds, the AI chooses a non-top-scored plan a
  non-trivial fraction of the time (statistical test with a tolerance band, not
  a brittle exact count).
- **Bravado persists:** a faction's bravado autocorrelates across hours (streaky)
  rather than re-randomizing each think — assert lag-1 correlation > threshold.

## Stays green

- Determinism doctrine — this slice is the second-most-likely place to break it
  (RNG read order). Every rng draw goes through `st.rng`; none through
  `Math.random`-equivalent host entropy.
- `full_game.rs` liveness (variety must not break loop convergence —
  `lopsided_war_concludes` still concludes).

## Feedback that would change this

- The *magnitude* of each knob is pure taste — too much perception noise = AI
  looks drunk; too little = robotic. Expect David to dial `SIGMA`/`TEMP`/`BAND`
  against in-app feel. Keep them as named tunables, not inline constants.
