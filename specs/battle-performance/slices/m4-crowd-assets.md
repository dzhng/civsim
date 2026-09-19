# M4 — crowd assets, publication and reload

Depends on M1b. Selected backend: raw WebGPU.

The promoted crowd/crowdAudience/impostor modules own GPU geometry, pose and atlas resources. Keep the shared raw pose palette and visibility policy. Make the existing offline property-atlas contract part of production asset publication; remove spec-asset URLs and lab compile-time catalog constants from the product. Implement staged crowd/atlas replacement: failed load/admission keeps the last valid crowd, cancellation disposes staged resources, successful replacement preserves current playback and invalidates frozen presentation correctly.

Prove all20 appearances, authored pose/equipment/materials, mounted and dead states, tier/atlas integrity and active-pose admission. Run existing pose/LOD and model reload/disposal scenes, including a failed/missing catalog and disposal during preparation. Report actual logical allocations rather than pretending buffers are Three geometries. Inspect posed/transition crops and keep inherited image reds explicit.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.


The current native facade returns only appearanceId/playback from
`debugSoldierAnim`; existing animation/default-renderer/delayed-root scenes also
consume submitted root, clip, phase and duration. Preserve truthful admitted-state
diagnostics through the selected crowd owner; do not read a tentative frontend
packet or weaken those verification scenes. This is separate from M1a signatures.
