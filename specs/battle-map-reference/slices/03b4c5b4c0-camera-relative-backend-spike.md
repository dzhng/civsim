# Slice 03B4C5B4C0 - camera-relative backend spike

## Contract

Decide the backend policy for the accepted close grass before implementing the
camera-relative field domain.

The architecture answer is: **grass is procedurally generated from camera
position in world space; GPU-native generation is only an optional backend for
that same domain.** This slice owns the backend seam, telemetry, and perf gates.
It does not choose or tune grass art.

Out of scope: close body representation, body coverage, strand scale, clump
rhythm, atlas art, colour, fog, terrain relief/material, cliffs, water, sky,
final reference composition, and whole-frame parity.

Do not start this slice until B4B1A0-B4B1A2 and B4B2-B4B5 have accepted the close
lab, body architecture, perf envelope, coverage, strand, clump, and close
palette/atlas stack. B4B1R is rejected camera/proxy evidence; the spike uses the
accepted B4B look as fixed input.

## API Seam

Introduce or specify the repo-equivalent seam before broad renderer work, such
as:

```ts
buildCameraRelativeGrassField(camera, terrain, profile, seed, backend)
```

The seam should make CPU and GPU paths publish the same meaning:

- backend id: `cpu-camera-field`, `gpu-camera-field`, or `legacy-fixed-field`;
- snapped camera-cell origin and stable world-space cell/ring ids;
- near, transition, mid, and far band bounds;
- accepted/emitted/recycled records and churn counts;
- slope/water/tint rejects and terrain-normal availability;
- LOD bucket counts, submitted primitives, draw calls, instance/storage bytes;
- CPU build/upload timing and GPU/compute timing when available.

The CPU backend is the first proof backend. A GPU smoke path is allowed only to
prove that the same record/bucket contract can move to compute/storage buffers;
it must not become a separate visual technique.

## Approach

- Freeze the accepted B4B close test surface, terrain patch, field seed,
  body/strand/clump representation, B4B5 atlas/palette, meadow/root material,
  and review windows.
- Build a focused backend workbench with one close camera, one sub-cell shifted
  camera, one cell-boundary crossing, and one mid/reference-ish camera stop.
- Start with CPU-generated snapped cells/rings around the camera. Record churn
  and hashes for sub-cell movement versus cell-boundary movement.
- If CPU build/upload is already over budget at the accepted body counts, create
  only a tiny GPU smoke route that writes the same packed record/bucket shape for
  a flat or hostile-slope fixture. Do not port false-earth's app stack.
- Record a decision note: `continue CPU-first`, `continue CPU proof but mark GPU
  required before adoption`, or `pull 03B6 forward behind the same seam`.

## Accept / Reject

Accept if the slice leaves one backend policy and one stable API seam:

- camera-position procedural generation is explicit and world anchored;
- CPU output is deterministic under sub-cell camera motion and only churns at
  snapped cell/ring boundaries;
- perf telemetry can be compared against `full-game-rendering-performance`;
- the accepted B4B close look is unchanged in the lab crops;
- GPU, if tried, is visually/statistically equivalent to CPU on the focused
  contract before any indirect draw ambition.

Reject if the spike picks GPU because it looks denser or prettier, forks the
record shape, changes the close body representation, hides churn with fog/camera
changes, requires broad `FrameShell` surgery before a smoke route works, or
turns into full reference composition tuning.

## Gates

- Focused tests for deterministic hashes, snapped-origin stability, churn counts,
  band counts, and record/bucket shape.
- A backend contact sheet with current close, sub-cell shift, cell-boundary
  crossing, and mid/reference-ish stops plus a stats table.
- Performance evidence using the same hardware/baseline discipline as
  `full-game-rendering-performance`: p95/median frame numbers, CPU build/upload
  times, draw times, instance/storage bytes, and memory. Treat the scene's
  current-renderer comparison floors as the adoption language: median within the
  existing budget/floor, p95 within the existing budget/floor, upload/draw not
  worse beyond the recorded measurement floors, and heap within the existing
  ratio unless a bounded delta is explicitly justified.
- `compare-screenshots` for CPU-vs-GPU parity if a GPU smoke path exists, and for
  adjacent-position stability. Do not compare this slice to the final reference.
- Unprimed `screenshot-critique` scoped to popping, swimming, density seams, and
  accidental visual regression from the accepted close lab.
- Non-blocking `preview-shots` checkpoint for the backend contact sheet.

## Anti-Scope

- No new grass art, density, colour, fog, terrain, cliff, water, sky, or camera
  composition decisions.
- No Three.js/TSL, Leva, character interaction/waves, emissive/neon material, or
  false-earth palette.
- No indirect draws until a storage-buffer compute smoke path is equivalent and
  useful.
- No adoption into the default reference route. Adoption belongs to 03B5 after
  B4C1-B4E prove the camera-relative and LOD visuals.

## Next Slice

Continue with `03b4c5b4c1-camera-relative-field-domain.md` using the accepted
backend policy. Pull `03b6-gpu-compute-and-indirect.md` forward only if this
slice records CPU build/upload as the blocker and keeps the same record/domain
seam.
