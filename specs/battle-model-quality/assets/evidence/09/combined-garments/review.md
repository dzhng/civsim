# Combined shoulder fitting

Working integration under review; no art, contact or motion acceptance.
The combined source SHA-256 is
`bdad44ba83bc43042c3b69ba131443c42dbe6409eb88d9b7f03291ec9ff26ab6`.
It composes the [frozen garment study](../fitted-shoulders/review.md) with the
current face, sandals and corrected walking shield carry. The frozen study's
generated bundle was not substituted for the newer combined source.

## Evidence and limits

The production heavy-kit scene ran on localhost:5174 with the unchanged bundled
headless Chromium/SwiftShader setup. All submitted poses and newly rendered
frozen repeats pass, with no page errors. Eight old, unaccepted image comparisons
remain red; no baseline was blessed. The additional garment sheet was created
as a new unaccepted baseline and copied directly from that output. Walk/run and
ready images were copied from this run's actual-difference output.

The ready image differs from the immediately preceding combined candidate in
55,019 of 1,638,400 pixels. That establishes a real production-path change, not
its quality. Cameras, lighting, viewport and ready pose are fixed.

Root inspected all six focused garment poses in four native-size bearings,
all 28 walk and 25 run phases in sequential four-bearing grids, and native
walk-13/run-12 for close contact inspection. The shoulder-to-arm transition is
more continuous. The exposed pale cuffs remain too rigid, and a tiny pale sliver
is visible beneath the right sleeve at opposite run contact. Lower cloth still
deforms like shorts in some steps; the scabbard lacks convincing suspension.
The mail still reads like knitted fabric rather than linked metal. These remain
open work, not defects waived by technical checks.

The inherited frozen-source telemetry still reports hidden intersections,
including roughly 31 mm worst penetration in one run pose. This combined visual
review does not prove universal garment/body clearance. Looping GIFs are
derivatives of the captured frames, not a separate timing or foot-slide verdict.

## Review status

Exact bake verification, TypeScript and diff checks pass. The local CLI review
attempt terminates because its installed version cannot use the configured
model; it is not a passed review. Independent combined visual review inspected
every numbered garment and gait frame in all four bearings, the ready pair,
matched prior walk-00/run-12, enlarged torso/armpit crops and the supplied
reference. It favors the current shoulder silhouette with high confidence and
finds no obvious new gear detachment. It independently retains rigid cuffs/hem,
sweater-like mail and the small pale armpit sliver around run phases 10–16.
This supports retaining the integration as a working candidate, not acceptance.
Human Preview comparison was opened; no user verdict is recorded yet.

Independent source review found no concrete correctness or maintenance issue:
the fitted surface feeds thickness and weight transfer consistently, non-garment
surfaces retain their behavior, and the added 24 closeups preserve all existing
motion and static coverage. Syntax checking passed. Artifact equality is covered
by the separately run exact bake check, not inferred from that source review.

Shape review consolidates the repeated camera-bearing list in the existing
scene. The geometry remains authored in Blender, with fitting after subdivision
and before thickness and skin-weight transfer. No runtime path, dependency,
simulation behavior or performance threshold changes. The two source files add
26 lines and remove seven, including three explanatory comment lines. The
scene adds six poses by four bearings without removing any prior coverage.
