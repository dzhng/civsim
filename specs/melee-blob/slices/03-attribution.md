# Slice 03 — Attribution: force ledger + ablation matrix

Instrumentation only; shipped behavior byte-identical (golden unchanged IS the
containment proof). The deliverable is a verdict per hypothesis, with numbers.
**This slice ends with a mandatory reslice checkpoint** — update slices 04–07
and the README's Next Agent Prompt to match the verdicts before implementing.

## Contract

Answer, with measured terms (never inferred stories — trace the term to the
line that produces it, and confirm a named force actually ACTS on the body in
question):

1. **Crossing carrier (H1):** for each man crossing the seam plane on the
   immortal 300 s grind, read his crossing-tick force ledger (slice 01
   harness) and name the carrying channel. Steering carrier (magnet on porous
   `front_clear`, cruise) → 04 is a gating/hold fix. Collision residual
   (capped separation + 3-pass projection leaving corridors open) → 04 is the
   strong-layer constraint, i.e. the foundation path.
2. **Torque budget (H2):** net tangential impulse about the pair centroid per
   force channel (magnet / bond / weave / pivot / separation+slide / repel /
   hit_push), and whether it grows with tilt (the runaway signature).
3. **Chirality seed (H3):** does the rotation *sign* follow the friendly
   slide? Ablate `SLIDE=0` (and the index tiebreak if needed): does the sign
   randomize across the seed sweep, and the rate collapse?
4. **Ratchet (H4):** lattice-orientation angle before/after each
   `engaged_deep_reform` beat; ablate `DEEPREFORM=off`: does θ(t) plateau (the
   pivot spring holds) instead of ramping? Watch
   `column_contact_width_stays_near_its_deployed_footprint` under the ablation
   — the carve-out's reason must be re-provided by whatever replaces it.
5. **Pike void owner (H5):** per-bin gap profile with the standoff owners
   logged (bond vs repel, frontal-gate status per bin); re-measure with
   rotation suppressed to separate downstream-of-H2 from own-bug.
6. **Casualty feed:** band depth immortal vs mortal twin; correlate band-entry
   events with kills.

## API seam

All measurement runs on the slice-01 force-trace harness (its ledger and
torque/crossing query helpers) — no bespoke eprintln archaeology, no offline
recompute. If a question here needs a quantity the harness doesn't record,
extend the harness (that gap is a slice-01 defect, fix it there). Ablation
knobs extend the existing env pattern in `clash()`
(mechanics_melee.rs:27-38): `SLIDE`, `DEEPREFORM`, `STANDOFF_SOFT`, `MAGNET`,
`LEAN065`. Env-read in tests/Tunables only; zero-cost unset.

## Human can run / see

The verdict table (hypothesis → confirmed/killed → the deciding number)
appended to the spec README, plus per-ablation curves added to
`visualizations/seam-timeline.html`.

## Verification

- Golden unchanged; probes reproduce slice-02 numbers with no env set; full
  `scripts/test-mechanics` green.
- Every verdict cites the measured term, not a story. A hypothesis with an
  ambiguous number stays OPEN and gets its own probe before any fix slice
  consumes it.

## What would change this slice

If all metrics are deaf to every single-force ablation, that is
foundation-trigger (a) — stop, take the evidence to David, and reslice 04–07
as the rebuild ladder (new isolated foundation pins first).
