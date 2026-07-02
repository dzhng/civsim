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

## Raw ablation numbers (2026-07-02, slice 03)

All commands run from the repo root in this worktree. Default behavior remained
contained: `cargo test -p sim --test golden` green after adding the diagnostic
knobs.

### Torque budget

Command:
`cargo test -p sim --test force_trace --features force-trace write_slice03_torque_budget -- --ignored --nocapture`

Feature-on trace caveat applies. Values below are total torque summed per unit
over each 25s window; top terms are the largest signed channel terms in that
same window.

| variant | unit | window | rotation | total torque | largest measured terms |
|---|---:|---|---:|---:|---|
| immortal | 0 | 300-325s | 8.69 -> 4.32 | +221 | `SpeedCap` +178647, `PivotSpring` -150088, `SlotPull` -29501, `WeaveNet` -18446, `CorridorClamp` +11204 |
| immortal | 1 | 300-325s | 8.69 -> 4.32 | +585 | `SpeedCap` +153040, `PivotSpring` -130629, `SlotPull` -27707, `WeaveNet` -18035, `CorridorClamp` +12684 |
| immortal | 0 | 325-350s | 4.36 -> 6.06 | -226 | `SpeedCap` +181207, `PivotSpring` -151974, `SlotPull` -29685, `WeaveNet` -19017, `CorridorClamp` +11313 |
| immortal | 1 | 325-350s | 4.36 -> 6.06 | +907 | `SpeedCap` +159007, `PivotSpring` -135620, `SlotPull` -28496, `WeaveNet` -18507, `CorridorClamp` +13230 |
| immortal | 0 | 350-375s | 6.12 -> 8.98 | -271 | `SpeedCap` +161408, `PivotSpring` -135500, `SlotPull` -28616, `WeaveNet` -18710, `CorridorClamp` +11390 |
| immortal | 1 | 350-375s | 6.12 -> 8.98 | +271 | `SpeedCap` +161113, `PivotSpring` -137395, `SlotPull` -28538, `WeaveNet` -18669, `CorridorClamp` +11921 |
| immortal | 0 | 375-400s | 8.99 -> 6.28 | +360 | `SpeedCap` +161531, `PivotSpring` -137511, `SlotPull` -28297, `WeaveNet` -18863, `CorridorClamp` +12420 |
| immortal | 1 | 375-400s | 8.99 -> 6.28 | +261 | `SpeedCap` +166364, `PivotSpring` -139132, `SlotPull` -29156, `WeaveNet` -18895, `CorridorClamp` +12079 |
| mortal | 0 | 300-325s | 21.48 -> 46.87 | -745 | `PivotSpring` -43351, `SpeedCap` +37100, `WeaveNet` -5643, `SlotPull` +5013, `CorridorClamp` +2859 |
| mortal | 1 | 300-325s | 21.48 -> 46.87 | -490 | `PivotSpring` -37234, `SpeedCap` +33973, `SlotPull` +6633, `WeaveNet` -4747, `Magnet` -3204 |
| mortal | 0 | 325-350s | 46.83 -> 53.92 | +2238 | `SpeedCap` -13385, `SlotPull` +12311, `CorridorClamp` +2731, `Magnet` +2308, `EnemyBondInsideReachPush` -1860 |
| mortal | 1 | 325-350s | 46.83 -> 53.92 | +1609 | `SlotPull` +11075, `SpeedCap` -7106, `PivotSpring` -2862, `EnemyBondInsideReachPush` -2395, `CorridorClamp` +2142 |
| mortal | 0 | 350-375s | 53.93 -> 61.92 | +1172 | `PivotSpring` -44999, `SpeedCap` +39598, `SlotPull` +8555, `CorridorClamp` +3623, `Magnet` -2262 |
| mortal | 1 | 350-375s | 53.93 -> 61.92 | +990 | `PivotSpring` -109276, `SpeedCap` +100504, `WeaveNet` -6198, `Magnet` +5017, `CorridorClamp` +4001 |
| mortal | 0 | 375-400s | 61.90 -> 37.65 | -545 | `PivotSpring` -14925, `SpeedCap` +11164, `SlotPull` +1998, `WeaveNet` -1799, `EnemyBondInsideReachPush` +1685 |
| mortal | 1 | 375-400s | 61.90 -> 37.65 | +24 | `PivotSpring` -23188, `SpeedCap` +17261, `EnemyBondInsideReachPush` +3298, `WeaveNet` -2197, `SlotPull` +2195 |

### Chirality / ratchet / flank-curl sweep

Command:
`cargo test -p sim --test mechanics_melee blob_probe_slice03_chirality_and_ratchet_ablation -- --ignored --nocapture`

All rows are mortal heavy, seed sweep, rotation sampled at 300s/400s.

| config | seed | rot300 | rot400 | rate 300-400 | band p95 | silhouette floor |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 0 | -11.55 | +11.02 | +0.2257 | 0.36 | 0.85 |
| baseline | 1 | -14.09 | +0.57 | +0.1466 | 0.47 | 0.81 |
| baseline | 2 | -17.98 | -21.92 | -0.0395 | 0.35 | 0.84 |
| baseline | 3 | -11.86 | -23.39 | -0.1153 | 0.52 | 0.84 |
| baseline | 4 | +37.33 | +54.07 | +0.1674 | 3.02 | 0.61 |
| slide0 | 0 | +23.96 | +37.53 | +0.1356 | 1.46 | 0.76 |
| slide0 | 1 | -14.04 | -27.30 | -0.1326 | 0.52 | 0.81 |
| slide0 | 2 | -18.68 | -19.78 | -0.0110 | 1.27 | 0.80 |
| slide0 | 3 | -17.81 | -27.40 | -0.0959 | 1.54 | 0.81 |
| slide0 | 4 | -10.53 | -25.44 | -0.1491 | 0.44 | 0.84 |
| slide0_tiebreak0 | 0 | +23.96 | +37.53 | +0.1356 | 1.46 | 0.76 |
| slide0_tiebreak0 | 1 | -14.04 | -27.30 | -0.1326 | 0.52 | 0.81 |
| slide0_tiebreak0 | 2 | -18.68 | -19.78 | -0.0110 | 1.27 | 0.80 |
| slide0_tiebreak0 | 3 | -17.81 | -27.40 | -0.0959 | 1.54 | 0.81 |
| slide0_tiebreak0 | 4 | -10.53 | -25.44 | -0.1491 | 0.44 | 0.84 |
| deepreform0 | 0 | +5.27 | +179.98 | +1.7471 | 1.78 | 0.59 |
| deepreform0 | 1 | -2.43 | +179.93 | +1.8236 | 1.62 | 0.58 |
| deepreform0 | 2 | +18.24 | +179.73 | +1.6149 | 1.50 | 0.62 |
| deepreform0 | 3 | +7.28 | -9.49 | -0.1677 | 2.07 | 0.40 |
| deepreform0 | 4 | +15.32 | +179.93 | +1.6461 | 1.88 | 0.62 |
| slide0_deepreform1_flankcurl0 | 0 | -7.74 | -30.06 | -0.2232 | 0.41 | 0.84 |
| slide0_deepreform1_flankcurl0 | 1 | -18.65 | -13.76 | +0.0489 | 0.61 | 0.83 |
| slide0_deepreform1_flankcurl0 | 2 | -22.09 | -11.34 | +0.1075 | 0.49 | 0.78 |
| slide0_deepreform1_flankcurl0 | 3 | -15.44 | -8.70 | +0.0674 | 0.41 | 0.83 |
| slide0_deepreform1_flankcurl0 | 4 | -14.79 | -20.50 | -0.0571 | 0.44 | 0.84 |

### Engaged deep reform beat / contact width

Command:
`cargo test -p sim --test mechanics_melee blob_probe_slice03_deep_reform_ratchet -- --ignored --nocapture`

This probe is immortal heavy, seed `0x4202`. With reform on, late reassign beats
commonly moved lattice orientation by about 10-15 deg per beat; with reform off,
before/after deltas stayed near zero. Summary rows:

| deep reform | rot300 | rot400 | rate 300-400 | band p95 | width deployed | width min | width max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | +5.19 | +8.37 | +0.0318 | 1.08 | 6.30m | 6.58m | 12.87m |
| 0 | +4.16 | +0.28 | -0.0387 | 0.11 | 6.30m | 6.58m | 12.87m |

### Wrap torque isolation

Commands:
`SLIDE=0 cargo test -p sim --test force_trace --features force-trace write_slice03_torque_budget -- --ignored --nocapture`

`SLIDE=0 FLANKCURL=0 cargo test -p sim --test force_trace --features force-trace write_slice03_torque_budget -- --ignored --nocapture`

Mortal heavy total torque, averaged across both units per 25s window:

| config | 300-325s | 325-350s | 350-375s | 375-400s |
|---|---:|---:|---:|---:|
| slide0, flankcurl on | 4356.5 | 4096.5 | 3533.8 | 607.4 |
| slide0, flankcurl off | 3194.4 | 2590.0 | 2367.3 | -581.5 |

Over 300-375s, disabling flank curl reduced the residual total torque from
about 3996 to 2717 per 25s window (about 32%) but did not remove it.

### Pike owner bins

Command:
`cargo test -p sim --test mechanics_melee blob_probe_slice03_pike_void_owner_bins -- --ignored --nocapture`

Immortal pike, seed `0x4202`. The probe printed per-bin rows; selected summary:

| time | mid gap | end gap | lens void | rotation | owner pattern |
|---:|---:|---:|---:|---:|---|
| 60s | 2.27m | 2.51m | -0.24m | -10.5 deg | sampled nearest pairs had `frontal_gate=1/1` across bins; repel varied 0/2 |
| 200s | 2.66m | 2.53m | +0.13m | -10.8 deg | center bins were mostly bond-only/no-repel; wings still had `frontal_gate=1/1` |

### Full-noise band reconciliation

Command:
`cargo test -p sim --test mechanics_melee blob_probe_slice03_vibe_like_heavy_grind -- --ignored --nocapture`

Real HeavySword classes, morale on, default `micro_rough`, mortal, seed `0x4202`:

| band p95 | rot300 | rot400 | rate 300-400 | lens p95 | silhouette floor |
|---:|---:|---:|---:|---:|---:|
| 1.99 ranks | +24.63 deg | +39.72 deg | +0.1509 deg/s | -0.11m | 0.62 |
