# GPU libraries in actual soldier rendering

## Current handoff

The user authorized actual game-code ports, a separate branch, and progressive
pushes to draft PR https://github.com/dzhng/civsim/pull/5. Work belongs in
`codex/typegpu-vgpu-spike`; do not merge or change the original checkout.

Continue until the actual native/TypeGPU/vgpu game paths have been compared and
the PR contains the final evidence and recommendation. The initial diagnostic
app is a preliminary study, not production evidence.

- [x] Wire a compile-time library choice into real battle/campaign skinning; retain native reference.
- [x] Integrate independently implemented TypeGPU and vgpu kernels.
- [x] Compare production battle and campaign pixels, animation and model reload; record software-run limitations.
- [x] Run the existing 30k battle gate for each variant; record workload/LOD counts and failures honestly.
- [x] Review the complete diff, update the recommendation, commit and push final evidence.

## Contract under test

The port replaces the four-joint matrix reads and weighted reconstruction that
every skinned soldier vertex uses. Battle consumes the result through Three.js
node materials for visible and shadow meshes. Campaign consumes the same candidate
kernel in its raw WGSL vertex shader. This is real game logic on real asset and
frame paths. Pose generation, culling, LOD, instance packing, materials and frame
scheduling stay controlled so the experiment has one independent variable.

The native implementation preserves the existing arithmetic. Each candidate
owns one kernel shared across the two shader consumers. Library choice is a
build/dev-server setting (`RENDERER_LIBRARY`), so only the selected implementation
is loaded and the native reference does not pay for unused candidate runtimes.
The runtime stats must identify the actual selected skinning module.

The camera, depth, asset layouts, four-weight arithmetic order, animation time,
normal/tangent consumers, and shadow audiences are invariants. A library that
cannot express a necessary resource contract must report that limitation; do
not silently route its work through native code to obtain a green comparison.

## Verification

Use the existing scene runner and snapshot primitive for production captures.
Canonical snapshots use bundled Chromium/SwiftShader; hardware captures are
paired diagnostic evidence and never replace those baselines. Match camera,
viewport, tick, environment, assets and draw workloads across variants. Compare
full frames and soldier crops, then obtain unprimed screenshot critique before
accepting the visual result. Pixel equality establishes equivalence, not that an
unrelated existing visual defect is fixed.

The standing 30k gate exercises the real battle with foliage, multiple zooms,
panning and wheel input. Retain its budgets and content floors. Record each
variant independently on named hardware and compare matching counters; do not
interpret 30k simulated soldiers as 30k skinned draws if LOD selects impostors.
Use production campaign views as well as the controlled campaign fixture.

Every coherent completed checkpoint gets a focused commit and push to the same
PR. Update this handoff with new evidence or a changed seam before ending a pass.

## Integration checkpoint

Both candidate production battle/campaign smoke runs pass, including asset reload.
Type checking covers all three modules; all three production builds pass. The
independent Codex review found no actionable defects. Hardware close-ups have
9 visible mesh draws and 9 shadow mesh draws, with matching LOD counts. Both
candidates differ from native by 6 battle pixels (0.0006%) and 0 campaign pixels.
Native canonical software captures pass. TypeGPU matches both software baselines exactly.
vgpu timed out waiting for software-renderer readiness at 60 seconds, with no
page errors; its software equivalence remains unverified. Hardware runs pass for
all three. The supplementary road-side army capture is hardware evidence only.

An unprimed reviewer found no visible native/vgpu regression. Shared issues are
speckled grass, washed-out distant troops, weak contact shadows, truncated unit
card names, coarse campaign territory edges, aliased roads/buildings, and a city
label/plate obscuring the army at this framing. These are existing visual issues,
not fixes claimed by this experiment. Still images do not establish animation
stability; the production smoke supplies separate animation/reload checks.

The [choices ledger](choices.md) records scope, storage ownership, dependency pins,
selection, experimental TypeGPU API use, and evidence boundaries.

## Production result

The narrow unification works: each candidate defines one weighted-joint kernel
used by both actual renderers. This does not justify replacing either frame
renderer. For this WGSL-first seam, vgpu is the smaller bridge; TypeGPU adds typed
shader authoring but requires an experimental raw-buffer reference API. Neither
candidate removed the game's existing camera, material or resource contracts.

On Apple Metal 3, Chrome hardware, 150 GPU samples per static stop:

| Kernel | Mid GPU median | Vista GPU median | Existing full gate |
| --- | ---: | ---: | --- |
| Native | 13.33 ms | 20.27 ms | Pass |
| TypeGPU | 12.58 ms | 20.67 ms | Pass |
| vgpu | 13.07 ms | 29.17 ms | Close grass frame-pacing failure |

vgpu's close grass p95 was 50.15 / 47.45 ms at the requested 24 / 28 stops;
the gate reports settled zoom 8 at both. Its static GPU medians remained under
33 ms. All runs retained 30,560 soldiers and 585 scenery objects. These are
single whole-game observations, not isolated kernel timings or proof of a
speedup. Detailed checks and workload counts are in
[evidence/performance.json](evidence/performance.json). No budgets, content floors,
or existing assertions were changed.

Keep native as the default. TypeGPU remains the stronger candidate for future
typed compute work, but this actual port weakens any blanket recommendation to
migrate the renderer: it needs experimental interoperability at precisely this
boundary. vgpu's WGSL/Three bridge is viable in the tested skinning path, while
its resource-management adoption is separately blocked by the reproducible
compute/draw bind-group issue in the [initial study](../../apps/gpu-spike/README.md).
The skinning port uses its shader bridge and does not exercise that failing
resource cache. Neither result should be generalized to the other API path.

## Visual coverage and limitations

A repeat native hardware battle capture also differed by six pixels, while the
latest candidate captures matched the original reference exactly. The six-pixel
variation is therefore not evidence of a candidate regression. Both campaign
frames, including the supplementary road-side army view, match exactly for both
candidates. [Validation results](evidence/validation.json) retain check outcomes.

The supplementary unprimed critique found no geometry, equipment or occlusion
differences among the three road-side army captures. Labels and the banner still
hide parts of the central figures; thin edges are pixelated and fine contact
shadows are weak in all three. Hidden attachment details are not visually proven.

Existing tests and thresholds were preserved. The added `gpu-library-skinning`
scene checks selected-library identity, nonzero visible/shadow mesh draws, raw
campaign submissions, and paired snapshots. No simulation or balance behavior
was changed or re-pinned. The hardware 30k gate and production smoke tests were
run unchanged. Separate tests of the candidate modules passed type checking and
all three production builds; independent Codex review found no actionable defects.

The [vgpu repeat](evidence/vgpu-repeat.json) again failed the same close grass
p95 limit: 37.95 / 38.38 ms. Static medians were 15.10 / 25.62 ms. This reproduces
the failed acceptance check in this setup; it does not isolate the cause to the
kernel rather than browser scheduling or another interaction. The failure is
retained for follow-up and the branch remains an experiment.
