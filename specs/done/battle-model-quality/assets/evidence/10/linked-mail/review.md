# Linked-mail material candidate

Status: provisional material study on the frozen `b6d6b30c` body, equipment and
motion. No slice, appearance budget, production catalog or regression baseline
is accepted. Later geometry must rebuild this material through the same author.

## Focus and method

The Rome II reference's heavy backs distinguish small metal wires from dark
openings. The prior local material instead presents soft continuous bumps. This
study changes only the mail region in the existing Blender material author and
its generated maps. Mesh positions, normals, UVs, joints, weights, colors,
material IDs, faction masks and indices are identical; animation and skeleton
files are byte-identical. Five exported tangent components differ by at most
0.000101 between independent Blender builds. No tangent author was changed.

The maps retain the existing 2048-square single atlas and production material
path. All changed source-map pixels lie inside its existing mail tile; the
remaining materials are unchanged. Round-wire directions come from a Blender
periodic pair of alternating tilted torii, not extra runtime geometry. Metallic
wire, rough dark underlayer and local occlusion are independently authored;
there is no painted directional illumination. Area-filtering resolves subpixel
wire coverage before storage. The editable source `heavy-surfaces/mail-links.blend`
contains actual rings, a receiving plane and packed Cycles bakes. CPU
selected-to-active baking supplies normals, wire coverage and short-distance
ambient occlusion; it replaces custom ray-intersection code. Temporary source
objects and their datablocks are removed before the frozen soldier is exported.

## Iteration and independent review

The initial coarse-ring trial was rejected locally. A subsequent denser trial
made metal more apparent but a fresh unprimed critic identified regular
diamond/net openings rather than independently overlapping rings. Its native
[rejected detail](./rejected-net-detail.png) is retained, not accepted.

Independent source review found the alternating tilt already reversed depth
correctly at the two projected crossings. The actual defect was intersecting
wire tubes between those crossings: closest centerline distance about 0.0965,
against wire diameter 0.166. The revised row spacing gives sampled centerline
clearance 0.163 for a 0.140 wire diameter, preserving separate surfaces. Thicker,
more closely packed source links later use clearance 0.216 and diameter 0.200. The
review also identified under-sampling and a missing convergence condition;
area filtering was added, then Blender's existing baking pipeline replaced the
custom projection altogether. Separating source tubes alone did not satisfy the
visible material-read criterion: the atlas can still erase small crossings.
Final source review caught a missing outer neighbor after that diameter change;
row 3 is now included. Re-review confirms both wire projection and the bounded
0.20-distance AO have complete periodic neighbor support. No other source
blocker was found. The configured Codex CLI review could not run because its
installed version rejects `gpt-6-astra`; an independent read-only agent reviewed
the source instead. No model override, upgrade or usage reset was attempted.

The final fresh unprimed critic inspected full ready/gameplay context before the
front/rear detail crops and shoulder sheet. **B is less wrong, high confidence:**
it reads as metal mail through bright edges, dark openings and curved shoulder
highlights; A reads as knitted fabric. The critic found no blocking regression
in the supplied stills. My own inspection supports that focused improvement.

This is not acceptance of fully convincing individual links. The critic still
finds continuous lattice/cross-shaped junctions at extreme detail, horizontal
row banding mainly in rear crops, and an inflated close-fitting shoulder form.
That form is frozen geometry; this material makes it more apparent rather than
resolving it. Temporal shimmer was not evaluated. The existing atlas remains
2048 square; no resolution or memory allowance was enlarged to obtain this
provisional result.

The unscaled [ready comparison](./compare-ready-rear.png),
[gameplay comparison](./compare-gameplay-pitch-rear.png) and nearest-neighbor
2× [rear detail](./compare-mail-detail-rear.png) all put before on the left and
after on the right. [Pixel telemetry](./comparison.json) measures image change,
not correctness. All complete native before/after sheets and clay controls are
retained alongside these crops.

## Reproduction and verification boundary

Rebuild the frozen source using
`Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-heavy-kit.py`,
then `node packages/soldier-assets/bake/heavy-kit.mjs`. The production workbench
route is `/renderer/battle-models?ref=1&catalog=/assets/soldiers/candidates/heavy-kit/catalog.json`.
The unchanged full candidate scene remains runnable with
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5194 node web/scene.mjs heavy-kit`.
The existing candidate-sheet helper retains close, gameplay, head and hand
views and adds four-direction ready, mail and shoulder views. Mail uses pitch
1.4, zoom 900, target `[0,0,1.27]`; shoulder uses pitch 0.85, zoom 1000, target
`[0,0,1.43]`; both sample ready phase zero. Native captures are repeated on
freshly rendered frozen frames and checked through the existing `snapCheck`
with exact temporary comparison baselines, never promoted harness baselines.

For the identical-geometry clay control, the existing heavy-surfaces baker and
scene consume this frozen heavy-kit GLB instead of their historical fixture.
That temporary substitution is restored after capture. The archived clay images
are unscaled native left halves from that paired scene, omitting its earlier
material trial on the right. Source checks confirm their positions, normals,
UVs, weights, joints and indices exactly match the final frozen geometry. The
control therefore remains valid across these material-only iterations. It
creates no new renderer, harness or permanent route and is evidence only.

`heavy-kit.mjs --check` and the existing appearance-materials/material-swatches
tests pass. No test definition, threshold, timeout, simulation behavior or
production lighting was changed. [Source checks](./source-check.json) retain
the measured invariants. Obsolete content-addressed candidate maps are retired
from the current bundle, with recoverable scratch copies and Git history.

Before and after each pass 73 admission/pose/repeated-frame checks. The final
seven sheets intentionally differ from their temporary before comparisons;
none is reblessed. Head and hand sheets include visible mail, so they also
change even though those body parts and their own materials remain frozen.
The clay fixture passes all 35 presentation/repeat/difference checks.

The parent owns the integrated Preview feedback checkpoint, so this independent
worktree does not open a competing Preview window or infer human approval.

## Review cost

Authored source adds 110 code lines and deletes 20, plus eight added/four deleted
comment or docstring lines; five blank lines are excluded. This buys an editable
offline link source, native Blender baking and area filtering in the existing
material owner. There is no new runtime module, dependency, shader, test or
permanent harness. Generated source maps, candidates and captured evidence are
excluded from those counts. The distinct offline-source choice is recorded in
the spec's choices ledger; motif, wire size and restrained palette are delegated
material styling. Existing test behavior is unchanged.
