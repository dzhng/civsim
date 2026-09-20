# M4 — crowd assets, publication and reload

Depends on M1b. Selected backend: raw WebGPU.

The promoted crowd/crowdAudience/impostor modules own GPU geometry, pose and atlas resources. Keep the shared raw pose palette and visibility policy. Make the existing offline property-atlas contract part of production asset publication; remove spec-asset URLs and lab compile-time catalog constants from the product. Implement staged crowd/atlas replacement: failed load/admission keeps the last valid crowd, cancellation disposes staged resources, staging preserves current playback until commit and success invalidates frozen presentation correctly. The shared frontend then starts the accepted catalog's animation timeline, matching the existing phase-zero reload contract.

Prove all20 appearances, authored pose/equipment/materials, mounted and dead states, tier/atlas integrity and active-pose admission. Run existing pose/LOD and model reload/disposal scenes, including a failed/missing catalog and disposal during preparation. Report actual logical allocations rather than pretending buffers are Three geometries. Inspect posed/transition crops and keep inherited image reds explicit.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.

The selected crowd owner now supplies admitted root, clip, phase, duration and
playback diagnostics. Records are stable within a submitted pose and detached
from mutable frame scratch. Camera-only frames retain their submission identity.

Implementation and root admission/lifetime corrections are verified in
[publication evidence](../assets/m4-publication/README.md). Published atlases retain the verified offline bytes.
Remaining acceptance: inherited posed/LOD image gates, mounted/dead coverage and
production diagnostic migration remain explicit; reload correctness alone does
not close all crowd beauty or motion requirements.
