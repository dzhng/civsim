# Projection and LOD progress — integrated, visual gates pending

The coherent tick9000 checkpoint comparison has equal soldier counts, main/shadow
visibility counts and visible-tier histograms for all four backends at all six
checkpoints. Shadow tiers differ at15/60seconds: raw and TypeGPU retain88 more
l0 casters than Three and vgpu, replacing88 l3 casters; the other checkpoints match.
These are approximate camera poses, not exact work parity. The original reports
retain the mismatch. The eight-case matrix is still running; no final verdict.

Root reproduced two related policy problems with the actual CPU helpers:

- Orthographic near-plane crossings return Infinity in projectedSpanPixels;
  planCrowdLods also has an independent unconditional near-sphere guard. An
  orthographic projected footprint is finite and depth-independent. Both guards
  need a perspective distinction; changing only one is incomplete.
- Multi-level hysteresis tests only the raw destination's boundary. A body can
  retain l0 at8pixels, or l3 at33pixels, despite clearing intermediate boundaries.
  At the actual source map extents465.6613/582.0766, infantry projects to3.95824/
  3.16659pixels: fresh shadow assignment is l3, but prior l0 remains l0. The JSON
  examples record actual function output, not browser rendering or timing.

This proves the policy can retain unnecessary geometry, not that it explains the
exact88 identities. Prior LOD history, the fit's retained crowdNear value and
float32 versus double projection precision remain competing explanations. A
read-only consultation incorrectly ruled out hysteresis; the captured-scale
example disproves that exclusion. Copying float32 matrix numbers into a double
array would not isolate precision, because the rounding has already occurred.

The integrated correction (bee130b4/bb6e8685) keeps current pixel thresholds,1.5pixel hysteresis,
frustum membership, perspective near-plane protection and the shadow mesh floor.
It must prove progress through crossed intermediate boundaries and finite
orthographic detail. CPU regressions precede browser/motion/visual checks; no
visual fix or performance gain is accepted yet. The distinct crowdNear fit-
identity question remains open rather than being hidden by fixing the LOD symptom.


Root verification passes46 focused tests and full TypeScript. Independent Codex
review found no actionable regression and passed24 affected tests. Root then
corrected the new fixtures to use the captured full width and the actual default
1024 map: the worker had doubled both width and resolution, preserving pixel
scale while describing the wrong setup. The unnecessary map-size parameter was
removed. No existing fixture's inputs or golden hashes changed.

Root ran the corrected tests against the original7ca03e77 production policies:
exactly5 tests fail and19 pass. The same affected cases are green in the corrected
46-test integration run. This proves the regressions exercise these defects;
it is not motion/readability or GPU-cost evidence. The first root invocation
used the wrong working directory and found no tests; that failure is retained
separately. Compressed verification files are round-trip/hash checked.

[The test-change ledger](test-changes.md) records the one rewritten existing
contract and four new regressions. No screenshot baseline, numerical LOD boundary,
1.5pixel deadband, crowd visibility or standing performance threshold was changed.
