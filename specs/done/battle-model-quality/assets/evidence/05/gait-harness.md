# Deterministic gait harness repair

2026-09-06. This repairs browser observation coverage, not model or animation art.
The production runtime, simulation, shaders and snapshot baselines are unchanged.

## Red loop and diagnosis

The merged SwiftShader run reached only five samples over 16 ticks before the
old 20-second wall cutoff. The simulation clock caps catch-up at four ticks per
render frame. A disposable scheduling probe using the real `SimClock` reproduced
that failure with four-second frames. This is a scheduling fragility, not evidence
of a controller cadence regression.

The first deterministic attempt observed six-tick batches. Independent review
correctly found that intermediate clip flicker could escape observation. The
final scene advances one simulation tick while frozen, waits for the actual next
battle render callback, then reads submitted `debugSoldierAnim` data. It collects
91 consecutive samples across 90 ticks. GPU settling occurs only for readbacks.

Removing the old FPS-based pixel skip exposed another real failure: zero pixel
difference. The old camera call projected the target to `[-100000,-100000]`, and
the crop silently clamped to top-left sky. Full-frame/crop inspection confirmed
the empty target. The scene now uses the existing explicit `reviewFrame` camera
seam and rejects offscreen or incompletely framed vertical target envelopes.
No production camera behavior changed.

## Results and limits

Canonical scene against unchanged merged main on port 5174, with `VERIFY_GPU=1`:

- 91 samples, 90 ticks, eight soldiers; all checks pass and no page errors.
- Zero clip transitions, negative phase steps or flat steps; maximum step 0.0333.
- Measured and authored periods both 30 ticks; existing ±4.5-tick tolerance kept.
- Three-simulation-tick pixel difference 1.807; existing threshold >0.02 kept.
- Separate full-frame/crop inspection confirms the target body is in view.
- Syntax and diff whitespace checks pass. Scheduling-probe controls reject stale
  phase, one-tick clip flicker, and zero duration; these controls are CPU harness
  checks, not GPU articulation tests.

Local disposable evidence is under `throwaway/`: `gait-per-tick-final.json`,
`gait-deterministic.json` (the exposed pixel red), `gait-sampling-probe.mjs`,
`gait-before.png`/`gait-before-crop.png` (old invalid framing), and
`gait-framed-before.png`/`gait-framed-before-crop.png` (corrected framing).

Follow-up independent review found an inherited limitation: the pixel sanity can
change due to translation, terrain and neighboring soldiers even with rigid
target geometry. The gate therefore proves visible scene motion plus independently
verified submitted clip cadence, **not isolated rendered gait articulation**.
That limitation is retained explicitly; no claim of final animation fidelity or
improved visual quality follows from this pass.

The [evaluated-pose temporal evidence](../06/temporal-validation.md) records follow-through:
hold camera, world placement and background fixed; compare the isolated target's
rendered foreground across authored gait phases. A negative control that freezes
GPU articulation while submitted phases keep advancing must fail. This belongs
in the shared production pose fixture, not a second battle-specific pose harness.

## CHANGE LEDGER

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Sample coverage | Wall cutoff; asserted ≥6 samples/30 ticks despite 90-tick intent | 91 explicit consecutive samples/90 ticks | GPU throughput must not truncate simulation coverage. **moved** |
| Clip stability | Render-frame samples could omit intermediate ticks | Every tick observed; one-tick flicker control rejects | Independent review caught a gap in the initial batching repair. **your-regression** |
| Phase admission | Invalid phase/duration could enter cadence math | Finite loop phases and positive duration required | Keep malformed data from producing misleading cadence results. **moved** |
| Pixel motion | Three render frames; skipped below 20 FPS; invalid projection clamped to sky | Three simulation ticks on every adapter; explicit framing and projection rejection | Remove timing dependence and make the existing sanity check nonempty. **moved** |
| Half/full-period readbacks | Captured but never asserted | Removed | They provided no gate and waited on wall-clock phase polling. **moved** |

No new production ownership or architecture choice was introduced. The existing
simulation stepping, render submission, camera framing and GPU-settle owners are
used directly; no parallel test-only renderer or clock was added.
