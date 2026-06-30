# Slice 03B6 — GPU compute and indirect escalation

## Contract

Escalate to false-earth's full GPU-native architecture only after the CPU/packed
field version has proven the look and perf/readability telemetry says runtime CPU
prep or upload is the blocker.

## Approach

This is an implementation swap, not a visual tuning pass. Mirror the accepted
`grassField.ts` record shape with GPU storage buffers:

- compute writes packed blade records and visible LOD index buffers;
- reset/count/routing uses bounded atomics;
- render passes draw LOD buckets, preferably indirect only after a smoke test;
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
- no WebGPU validation warnings or black/blank frames occur;
- CPU upload bytes or frame p95 improves, or the GPU path enables a materially
  higher accepted blade budget within perf limits;
- buffer sizes stay under granted device caps.

Reject if compute requires broad `FrameShell` surgery before a smoke route works,
if indirect draws are unstable, or if the slice starts tuning color/density to
hide parity issues.

## Verification

- A tiny renderer-lab compute smoke scene before battle integration.
- CPU-vs-GPU parity scene for `battle-grass-field`.
- `battle-map-reference`, `battle-grass`, and `full-game-rendering-performance`.
- `compare-screenshots` for CPU-vs-GPU parity and target grass crops.
- `screenshot-critique` only after parity is green, scoped to accidental visual
  regressions.

## Next Slice

After compute is accepted or explicitly rejected, continue with
`03c-grass-color-texture.md`.
