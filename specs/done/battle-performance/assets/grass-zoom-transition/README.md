# Grass zoom transition: continuity candidate, acceptance open

Fixed baseline feabc4d4 and candidate 8ac39665 were captured through the actual
TypeGPU Menu route at 1440×900, DPR2, single shadows, map A, tick30 and the same
15,560-soldier state hash. These are frozen correctness controls, not timings.
The physical camera crosses each 15/30/45m boundary by ±0.01m, then reverses.
The camera target is (20,-625), yaw −π/2; both pitch0.55 and horizon-facing
pitch0.25 were checked. All canonical-state, requested-height, screenshot,
page-error and disposal checks pass. Full captures and runnable scripts remain
under `throwaway/grass-zoom-hardware/` in the implementation worktree.

The candidate smooths authored transition parameters. At15m the dense-radius
jump across2cm falls from27.5m to0.103m; at30m from38.5m to0.144m; at45m from55m
to0.206m. This proves uniform continuity, not perceptual smoothness.

Same-height full-frame differences confirm an actual rendering change at15m
and30m. At45m, pitch0.55 shows only90 changed pixels below the boundary and
zero above it: that view is weak evidence for the far transition. Lowering the
pitch to0.25 exposes8,393 changed pixels below45m, showing the candidate does
reach this view. It does not establish a visual improvement.

The initial fixed foreground patch misses the affected bands at15m/45m.
Whole-world temporal mean absolute differences at pitch0.25 are mixed:
4.731→4.761 at15m, 3.579→3.540 at30m, and2.85572→2.85595 at45m (8-bit RGB units).
These include camera reprojection and are not a clean grass-pop metric. Do not
use them as a passed motion gate. A continuous, properly framed ground sequence,
unprimed visual review and quiet performance controls are still owed. The
candidate remains unadopted; no grass-popping or stutter fix is claimed.
