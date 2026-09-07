# Medium march load response

Candidate-only revision of the archived upright march in `cbe3dc7a`. It retains
the held-hedge + atEase appearance context; neither walking alone nor the frozen
forward `pike-carry` action is relabeled as atEase. No production binding changed.

The chest counterturns by 2.3 degrees either side of its carry orientation. The
held load has a small delayed pitch and rise response; the connected arms reach
both purchases each authored frame, allowing the elbows to absorb relative
motion. Left elbow angle spans 82.5–96.9 degrees and right 99.4–105.0. The pike is
carried six centimetres farther out to improve ankle clearance. Shield orientation
and both purchases remain authored in the original rig; no runtime IK, simulation
change, extra finger articulation or mesh fitting was added.

## Separate contracts

The old rigid carry's exact palm-to-shaft numerical control remains archived and
unchanged. Articulating the arms introduces up to 0.958 mm of between-key palm
frame error, so the old 0.1 mm frame-error gate does **not** pass this revision.
It has not been silently repinned as the same contract.

Actual geometry was checked separately at 109 quarter-frame samples. Skin-material
triangles weighted to each hand were tested against the actual posed shaft mesh,
excluding weapon geometry from the hand selection. Left-hand skin and shaft have
at least four intersecting triangle pairs at every sample; the nearest left skin
vertex is at most 0.241 mm from the shaft surface. The right nearest skin vertex
is at most 0.163 mm away, near-contact without guaranteed triangle intersection.
These are finite-geometry contact measurements, not a claim based only on palm
target positions. Opposing rendered views are still necessary for judging purchase.

The butt-to-lower-leg probe improves from 17.75 mm to 88.62 mm minimum sampled
surface distance. Subtracting the maximum butt-triangle sampling cell gives a
72.51 mm conservative spatial lower bound at sampled times. This is not a
continuous-time collision proof. The prior 2.27 mm sole penetration and flat
passing footfall remain inherited; this pass intentionally preserves every
lower-body walk matrix.

Source geometry, rig and all non-walk clips remain exact. As in the archived
motion-only comparison, exporter tangent drift was isolated from exact
position/index/normal/UV/weight data, then donor tangents were pinned locally.
An initial Euler-branch interpolation failure was caught by the quarter-frame
probe and preserved in scratch; compatible Euler key selection fixes the
large wrist spin before capture.

## Visual review

Five production two-cycle films (36 frames each, 20 fps, continuous 1.7 m/s travel)
and two formation views pass 544 checks including exact repeated captures.
Opposing context captures pass another 20 checks. Author inspected every ordered
frame in all five sequences, both formation views and the purchase contexts:
elbow/shield response is visible, no obvious seam snap appears, the complete-pike
views retain tip/butt containment, and opposing hand purchases remain convincing.
Fresh A/B critique inspected 288 tiles plus five contexts (ordered stills, not GIF
playback) and preferred neither version. It judged B usable provisionally, not a
clear naturalness upgrade: the high cross-chest brace remains constrained, with
equipment rocking only weakly connected to torso settling at sheet scale. It
found convincing purchase/straps and no established penetration or isolated seam
discontinuity. The author accepts this limit: added joint motion has not visibly
resolved the underlying braced posture. The inherited passing footfall was not
revised. Clearance improves, but naturalness acceptance remains open.

Fresh visual session `01a07cb5-971a-7bb3-bbf4-2094d546e879`, terminal 0, bundled
CLI defaults and read-only image-only A/B task; exact final is preserved in
`fresh-critique.txt` (including the critic's original Markdown hard breaks).
Independent code review session
`01a07cb4-2ea7-75d0-9751-92a7e3684c2d`, terminal 0, found no actionable defects;
it did not rerun Blender or browser verification.

Source candidate SHA-256, blend:
`e76924cb1305cdc0d75299d5cd06b14c65afb4d0d0e17254f29d743dd6e29ae3`;
GLB: `76cc9483477aa84a1315038937baf76986d207153a21edf935d0e5c123d76197`.
