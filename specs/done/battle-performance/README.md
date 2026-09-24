# Battle performance and TypeGPU rendering

Historical run artifacts have been removed. References to experiments below
record past findings; they are not links to retained reports or captures.

Battles use one TypeGPU renderer, with readable default tactical shadows and a
five-minute benchmark available from the game menu. The benchmark advances a real
battle to its recorded contact state, then measures live combat while the camera
pans, zooms and visits the horizon. Results show average, low and high FPS, frame-time
spikes and a chart, with the underlying report available as JSON.

## Why this architecture

Raw WebGPU and TypeGPU were effectively tied in the comparison; the ordering
reversed between measured rounds. TypeGPU was selected for its checked resource
layouts, binding contracts and shader interfaces. Vgpu offered no sufficient
advantage to justify its additional integration cost. The historical experiments
are engineering evidence with explicit workload and host-noise limits, not a
claim of a universal renderer ranking. Experimental implementations and their
exclusive dependencies are removed; Git history and retained reports preserve the
research. The maintained benchmark runs the actual production game.

The production entry is [BattleRenderer](../../../web/src/battle/renderer.ts),
which presents through [the TypeGPU world](../../../packages/battle-renderer/src/battleScene.ts).
Simulation, camera policy, terrain generation and animation remain independent
owners. The old Three battle world and frontend backend selector are removed.
Campaign rendering keeps its existing WebGPU owner; Three remains in isolated
asset-authoring, generic material/Blender review and a test-only shadow-camera
reference. These are not alternate battle renderers.

TypeGPU owns battle GPU resources and command submission. Typed shader functions
coexist with WGSL bodies whose expressions require shader compilation and numerical
checks. This is not a claim that TypeScript verifies every retained WGSL expression.
The pinned experimental command encoder is a deliberate dependency risk: it keeps
submission and resources under the same typed owner.

## Performance and limits

Performance improvement is demonstrated without promising smooth 60 FPS. Matched
live-observation replay reduced animation timeline update time by **22.26%** with
exact state/playback equivalence. An additional frozen-pose copy improvement reduced
that bounded update workload by **21.37%** against its preceding version. These
percentages describe different sequential comparisons; they are not added together
or presented as total frame-rate gains. Shared immutable material images reduced
the measured logical image payload by **95%**, with pixel-identical comparison
frames. Logical requested bytes are not physical VRAM.

See the replay evidence,
the frozen-copy evidence,
image ownership evidence, and the
final acceptance record for measurements and scope.
The user's closing criterion was measurable improvement plus the complete battle
cutover; the original absolute 60 FPS target was explicitly superseded. Remaining
frame-time spikes are reported, not treated as solved.

## Invariants

- Rendering must not change simulation outcomes, save semantics or battle orders.
- A presented camera, crowd generation and GPU timing refer to the frame actually
  submitted. Readiness work is counted separately; missing timings stay unavailable.
- A failed staged resource replacement retains the admitted world. Disposal waits
  for owned work, and repeated battle entry must not accumulate live resources.
- Default gameplay requires the complete published mesh and offline atlas catalogs.
  Mesh-only authoring is an explicit capability, never a missing-asset fallback.
- Main-view culling and shadow-caster culling are separate. Offscreen casters that
  affect visible receivers must survive; projected LOD must preserve weapon detail.
- The default single shadow map follows the relevant view instead of spending its
  resolution on the whole map. High retains cascades as an explicit quality option.
- Frozen-frame reuse cannot stand in for newly rendered benchmark frames. The live
  camera tour uses elapsed time, so slow rendering cannot shorten the workload.
- Average FPS uses total recorded time; low/high and percentile metrics remain
  distinct. Chart reduction preserves a bin's largest stall, and export keeps the
  original samples. Preparation and cancelled partial runs identify themselves.

The [renderer package rationale](../../../packages/battle-renderer/README.md),
[benchmark implementation](../../../web/src/battle/benchmark/benchmarkRun.ts),
[chart](../../../web/src/ui/benchmark/BenchmarkFrameChart.tsx), and
[production facade tests](../../../web/tests/battleRenderer.test.ts) own the mechanics.

## Evidence boundaries

Moving existing coarse meshes closer saved GPU time but weakened pikes and body
readability; that shortcut was rejected. A later component-preserving intermediate
mesh experiment was promising but remains unpublished under the user's closeout
scope. Its live report must not be confused with the production catalog's result.
Research evidence preserves the
scope and limits. Additional camera-pose reuse and grass-transition experiments
were not adopted without their remaining motion/performance evidence.

Three-object inspection probes cannot validate the new owner. They were retired
with explicit replacement and coverage records; portable policy, numerical,
lifetime and gameplay checks were retained. Retirement is not a passing visual
result. The change ledger records those moves.

## Visual provenance

[The user's tactical screenshot](assets/user-tactical-reference.png) defined the
required framing and shadow readability. Final tactical controls
compare default shadows with shadows disabled at that framing, and retain an
independent review. Historical component comparisons, rejected candidates and
reference images remain under `assets/`; their reports describe their original
scope and do not retroactively certify the final renderer.

The final forest comparison uses the current pre-cutover assets, not old placeholder
snapshot imagery. It found no one-sided canopy loss; weak canopy readability and
repetitive dense-rank shadow bands remain documented visual limitations.

[Implementation choices](choices.md) records the architectural decisions inherited
by future work. Historical build order and slice checklists are intentionally absent.
