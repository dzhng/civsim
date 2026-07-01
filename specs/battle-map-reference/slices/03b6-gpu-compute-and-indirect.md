# Slice 03B6 — GPU compute and indirect escalation

## Contract

Escalate to a GPU-native backend for the accepted camera-relative domain only
after B4C0 or 03B5 shows that the accepted CPU/packed field version has the right
domain/look but runtime CPU prep or upload is the blocker.

This is a backend swap behind the accepted camera-relative field seam. It is not
a separate grass technique and must not change the visual contract.

## Approach

This is an implementation swap, not a visual tuning pass or a false-earth app
port. Mirror the accepted `grassField.ts` / B4C0 record-domain shape with GPU
storage buffers:

- compute writes packed blade records and visible LOD index buffers;
- reset/count/routing uses bounded atomics;
- render passes draw LOD buckets, preferably indirect only after a smoke test;
- route stats preserve the same backend/domain/band/churn counters as CPU;
- CPU fallback remains available for browsers/devices where the compute path is
  unavailable or unstable.

Do not import Three.js, TSL, Leva, or false-earth's app stack.

## Fixed Inputs

- Freeze visuals from Slices 03B3-03B5.
- Keep frame graph phase/depth order fixed: grass remains `world-opaque`
  `world-depth` before soldiers and before read-only world decals.
- Keep route stats and screenshot crops identical in meaning across CPU and GPU
  modes.

## Accept / Reject

Accept only if:

- CPU and GPU modes are visually equivalent in focused grass crops;
- CPU and GPU modes publish equivalent record/band/churn/LOD telemetry for the
  focused fixtures;
- no WebGPU validation warnings or black/blank frames occur;
- CPU upload bytes or frame p95 improves, or the GPU path enables a materially
  higher accepted blade budget within perf limits;
- buffer sizes stay under granted device caps.

Reject if compute requires broad `FrameShell` surgery before a smoke route works,
if indirect draws are unstable, if CPU and GPU fork the record/domain contract, or
if the slice starts tuning color/density to hide parity issues.

## Verification

- A tiny renderer-lab compute smoke scene before battle integration, preferably
  pulled forward from B4C0 only when B4C0 records CPU/upload as the blocker.
- CPU-vs-GPU parity scene for `battle-grass-field`.
- `battle-map-reference`, `battle-grass`, and `full-game-rendering-performance`.
- `compare-screenshots` for CPU-vs-GPU parity and target grass crops.
- `screenshot-critique` only after parity is green, scoped to accidental visual
  regressions.

## Next Slice

After compute is accepted or explicitly rejected, continue with
`03c-grass-color-texture.md`.
