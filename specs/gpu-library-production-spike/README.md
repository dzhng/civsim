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
- [ ] Verify production battle and campaign pixels, animation and model reload with identical inputs.
- [ ] Run the existing 30k battle gate for each variant; record workload/LOD counts and baseline failures honestly.
- [ ] Review the complete diff, update the recommendation, commit and push final evidence.

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
Native canonical software captures pass; candidate software comparisons and the
serial whole-game performance evidence are still being collected.

An unprimed reviewer found no visible native/vgpu regression. Shared issues are
speckled grass, washed-out distant troops, weak contact shadows, truncated unit
card names, coarse campaign territory edges, aliased roads/buildings, and a city
label/plate obscuring the army at this framing. These are existing visual issues,
not fixes claimed by this experiment. Still images do not establish animation
stability; the production smoke supplies separate animation/reload checks.

The [choices ledger](choices.md) records scope, storage ownership, dependency pins,
selection, experimental TypeGPU API use, and evidence boundaries.
