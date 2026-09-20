# Construct the retained crowd once

The native facade builds per-soldier records from columns, then admission copies
those records into a second retained pool. Make the snapshot the owner that builds
retained records directly. Keep one mapping of columns to instance values, with
record adoption only for real fixture and asset-reload consumers. Cache mounted
asset facts per generation. No packed-column redesign, shader/LOD changes or
production renderer switch belongs in this pass.

Borrowed inputs must be consumed synchronously before any asynchronous boundary.
Retained mutable playback must be isolated, while readonly frozen pose arrays and
settled endpoint aliasing retain their existing meaning. Camera-only reprojection
reads the retained pose without advancing submission. Failure, asset replacement,
freeze, disposal and truthful build-time reporting keep their current contracts.
Source Three remains production; TypeGPU/vgpu deferred comparison uploads must
also respect the borrow lifetime. No old backend is deleted in this slice.

Before changing code, retain a differential oracle of the old build-plus-capture
behavior in scratch. Verify count mismatch, mapping/defaults, faction/seed/terrain,
mutable-input mutation, optional clearing, shrink/regrowth, playback aliases and
failure/reprojection behavior. Existing GPU byte-contract tests stay unchanged.
Run focused shared/native/source tests and TypeScript before hardware checks.

Root then verifies matched raw scene captures including camera-only reprojection
and the unchanged source/raw30k floor. For adoption, compare the changed candidate
against the fixed adopted snapshot build using the pinned30k wide and moving ABBA
screen: both candidate CPU medians beat both controls in each segment, pooled CPU
median improves at least10% in each, and presented cadence does not regress.
Require matched population/state and inspect pixel output. Serialize timing with
owned CPU/GPU jobs. This supplemental paused workload is not final live acceptance.

The [ownership review](../assets/07-crowd-ownership/README.md) motivates this pass.
Removed profile labels or estimated savings do not establish a speedup. Candidate
implementation is active; adoption requires the measurements above.
