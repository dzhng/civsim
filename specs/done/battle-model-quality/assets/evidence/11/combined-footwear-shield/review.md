# Fitted footwear and walking shield carry

Less-wrong working composition, not overall model or motion acceptance.
Source SHA-256:
`dd8abbffe8af8286db003e5e835487fa2c5b31e3354274ca94cf3144a3d24391`.
This combines the current facial-form body, loaded gait, weighted belt and
surfaces with footwear source a9b55b0e. The walking left arm carries the shield
farther forward; ready and run retain their existing arm authoring. The new
sole footprint is used to rebuild grounding for both gaits.

## Contact regression and correction

The [previous combined review](../combined-loaded-gait/review.md) rejected
shield-side knee penetration. A source-space triangle intersection probe sampled
109 quarter-frame positions of the walk. Reapplying the previous left-arm
directions to this same body/gear finds intersections at 33 samples from frame
8.5 through 16.5; the corrected carry finds none. The archived log records the
counts. This covers shield versus lower-body surface triangles only, not every
attachment, runtime interpolation detail or historical handling claim.

Root inspected all 28 walk and 25 run phases in four-bearing sequential sheets,
plus native walk-13 for the reported knee defect. The shield now has a continuous
front surface, without the protruding knee; the side view shows the carry ahead
of the step. Sandals have a thinner sole and visible heel retention. The body
still reads simplified, the shoulder sleeves remain bulky with pale armpit
patches, the skirt deforms stiffly, and the scabbard needs believable suspension.

Fresh unprimed critique inspected ready, feet close-up and every numbered phase
from all four bearings, comparing seven prior matched phases. It prefers this
composition: high confidence for fitted footwear, moderate for shield carry;
no new visible intersection, detached grip or foot/sandal separation. It retains
the underarm wedges, shorts-like skirt shape and low walking recovery clearance
as unresolved. No timed playback verdict is inferred from these stills. GIFs
are looping review derivatives, not proof of cadence or sliding quality.

## Verification and review

The existing heavy-kit browser scene ran on localhost:5174 with bundled headless
Chromium/SwiftShader (`VERIFY_GPU=1`) and unchanged cameras, viewport and daylight.
All production pose admissions and newly rendered frozen-repeat checks pass;
no page errors. Eight image comparisons remain red against unaccepted old
baselines. No image was blessed and no production catalog was promoted.

Blender export, exact candidate bake/check, TypeScript and diff checks pass.
Independent source review found no blocking issue in footwear sampling/binding,
world-axis rotation, sole-based grounding, walk-only carry adjustment or the
scene/baker clip coverage. The installed Codex CLI remains unable to review the
configured model; this is a peer review, not a claimed CLI pass.

Shape review keeps geometry and motion in their existing owners, with one body
orientation helper shared by both gaits. No runtime mechanism or dependency is
added. The four source files add 118 lines and remove 34, including comments;
most new code authors the sandal surfaces. Generated assets and review evidence
are separate from that source cost. Temporary probes/derivatives stay in
`throwaway/`, and active unaccepted baselines are excluded from the checkpoint.

Harness behavior change: the old 31-row walk capture becomes 28 rows matching
the corrected 0.9-second authored cycle; a 25-row run capture is added. All four
bearings and original static/ready/feet views remain. No simulation test behavior
or performance threshold changes.
