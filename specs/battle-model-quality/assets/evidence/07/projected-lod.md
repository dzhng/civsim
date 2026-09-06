# Projected detail, not distance from the focus

The [shared projection owner](../../../../../packages/renderer-core/src/camera3d.ts)
now supplies a frame-owned pixel scale and signed view depth. The existing foot
and mounted reference spans remain unchanged. Camera-facing spans stay nonzero
at overhead views; actual instance elevation participates in depth. This is a
reference-body detail measure, not an authored silhouette/bounds replacement.

The [production planner](../../../../../packages/photoreal-renderer/src/battle/crowdLod.ts)
uses the unchanged animated/corpse-transformed bounds to select contributing
main and shadow views. Near-plane intersections retain full detail. Bodies
behind the main camera make no main-view contribution but remain casters when a
shadow camera contains them. Each audience independently selects detail under
the unchanged pixel thresholds and hysteresis. Shadow footprints use the actual
orthographic camera and map resolution. Their minimum representation is the
coarsest mesh; all three shadow mesh tiers cast, while sprites remain non-casters.
The [choice ledger](../../../choices.md) owns that explicit caster-policy decision.

No camera rig, light, simulation, asset, framebuffer setting or numeric threshold
changed. The existing skip-tier hysteresis behavior is preserved, including its
conservative retention when a jump lands inside a coarser boundary's deadband.
Production telemetry separates view-visible and shadow-only bodies from their
union, so a submitted caster is not mistaken for an on-screen soldier.

## Representation belongs to its audience

The main view must retain its far impostor even when a shadow map needs geometry.
Impostors have an intentional minimum screen coverage to remain readable through
alpha-tested mipmaps. Applying a shadow mesh floor to the main view removes that
treatment: the production overview comparison showed sparse faint dots replacing
readable formations. Correct physical projection is not permission to discard an
existing readability treatment.

Main and shadow buckets use the same draw/material/upload path. Three's built-in
object layers exclude shadow-only meshes from the main color and depth passes.
Shadow cameras explicitly include the caster layer before cascade cloning;
otherwise Three inherits the main camera mask and loses those casters. Ordinary
world objects remain on the default layer. No custom shadow pass or shader mask
is necessary.

Both audiences reference one computed pose slot per source soldier. Geometry and
materials have independent owners per audience, avoiding aliases in Three's
disposal caches. The additional static buffer payload is reported separately as
`shadowGeometryBytes`; it is not a per-frame upload count or proof of resident GPU
memory. Image surfaces and pose storage remain shared. Allocation and frame-cost
gates must measure the extra draws/resources in production.

## Evidence and remaining gates

At the saved closest gameplay camera, a mounted reference at `(0,150,0)` measures
**15.4346348194 pixels** using the camera-facing span. The old radial-focus ruler
reported21.306 pixels. Independent projection of an upright2.61m segment reports
15.842 pixels: this demonstrates the old mismatch, not the new method's formula.
Both correct projections cross the existing L0 exit boundary without retuning.

Focused audience/projection/camera/palette tests pass together:21 tests; typecheck
passes. Reintroducing the combined decision makes the distant-impostor regression
fail with L2 instead of L3; separation restores L3 plus its L2 caster. Actual
single and CSM shadow-camera setup admits caster-only objects without admitting
them to the main camera. A dual-audience queue of250 bodies retains the same
palette capacity and upload stats as250 main-only bodies on a device limit that
rejects500 pose slots.

GPU work is reserved for integration: production before/after captures, final
unprimed critique, standing30k gate and matched animated-budget sweeps remain
unrun for this source checkpoint. No visual fix or measured art budget is claimed.
Pre-existing screenshot differences must not be attributed to this correction.

## Combined-tier integration: rejected, superseded by separate audiences

Root typecheck and20 focused tests pass. The [production consumer run](projected-lod-consumers.json)
passes LOD and mounted-readability assertions; the camera snapshot differs as
expected, including its separately recorded pre-existing baseline difference.
The [current candidate](camera-projected-lod.png) and matched
[before image](camera-before-projected-lod.png) differ materially, not a no-op.
[Image telemetry](projected-lod-image-metrics.json) records full-frame grayscale
MAE1.56, edge-energy ratio0.979, and near-crop MAE8.55. Scores are not acceptance.

Root inspected both full sheets and enlarged near/overview crops. A fresh
history-free visual reviewer independently found the same tradeoff: the candidate
reveals close weapon tips, with coherent overlap, but makes distant formations
sparse and low-contrast enough that smaller formations nearly disappear. The
before image preserves distant formation readability better. This is a rejected
visual change, not a defect waived because the projection math is correct.
Investigate the coupling that substitutes a mesh for the main-view far
representation when a shadow view asks for geometry; preserve both consumers'
needs without lowering readability assertions.

The [matched geometry repeat](mounted-geometry-projected.json) reduces L0 count
from16,586 to1,432 and measures14–15ms GPU medians. It still fails interruption
cadence at33.33ms. Delayed frames have24–27ms preceding CPU work, so this is not
just rounding: an unused playback result built during observation is the next
focused CPU candidate. No art envelope is accepted. Root owns subsequent image
critique, strict repeat and hardware gates after these corrections.

## Changed-test ledger

### Separate-audience integration checkpoint

Root integratione82904c4 passes61 focused tests and typecheck. The
[production consumer run](separated-consumers.json) passes all behavior checks
and reports one camera-image baseline difference. The old baseline already had
unrelated terrain/material differences; it has not been re-blessed.
[Current full sheet](camera-separated-audiences.png), [near crop](separated-near.png)
and [overview crop](separated-overview.png) are compared with the archived
pre-projection actual image, not that stale baseline. A byte comparison proves
the full candidate changes.

Root and a fresh unprimed reviewer inspected both full sheets and all four
crops. The reviewer finds unchanged distant ranks, gaps and footprint (high
confidence), no obvious missing bodies or new depth-order defect, and preserved
scale. Close views expose pale chunky weapon-tip geometry; this is existing
placeholder shape becoming visible at the correct near detail, not accepted
soldier art. Feet remain occluded, so these images do not establish ground-contact
quality or an improvement in shadows. The far-readability regression is no longer
visible in the reviewed frame; this does not accept the model quality itself.

The unchanged [standing30k hardware gate](separated-standing.json) passes,
including close grass-on cadence. The [strict temporal repeat](separated-temporal-red.json)
has one failure: class7/tick0's validated-palette versus CPU-preposed image differs
by up to17 channel values over67,215 pixels. Other assertions pass. Diagnosis is
open; no tolerance was relaxed and no live animated budget is accepted.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `photorealCrowdLod`: coarsening | Focus distances0/30/150/420 with zoom12 produced tiers0/1/2/3. | Actual perspective at10/150/300/1000m produces tiers0/1/2/3; the visible150m mounted body exits L0 with previous L0. | The old test certified radial falloff rather than projection. **moved** |
| `photorealCrowdLod`: floor | A distant instance under artificial zoom0.1 hit2.25px/L3. | A genuinely unseen body contributes nothing and retains2.25px/L3 as the policy floor, with zero visibility. | Visibility and size now derive from an actual camera. **moved** |
| `photorealCrowdLod`: hysteresis | Zoom was reverse-engineered to represent17.5/18.5px; previous tiers0/1 held. | The same pixel expectations hold directly, with exit/entry checks and actual shadow-only caster admission. | The ruler changes; thresholds and hysteresis do not. **moved** |

New coverage additionally checks independent projected endpoints, depth versus
radial distance, elevation, framebuffer scaling, FOV/yaw, overhead framing,
near/behind cases, a finer shadow map winning, corpse-roll admission, and actual
mesh caster flags. The temporal scene's synthetic frustum override now targets
the new view entry; its original roll-sensitive culling assertions are unchanged.

### Audience correction ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `photorealCrowdLod`: hysteresis/caster | A shadow-only body had one combined L2 assignment. | Main assignment is L3 with no main visibility; separate shadow assignment remains L2. The same four hysteresis boundary assertions hold. | Main representation must not inherit a shadow floor. **moved** |
| `photorealCrowdLod`: actual caster producer | All three mesh objects cast and received shadows. | All three shadow-audience objects cast but do not receive; main objects receive but do not cast. | Object layers route independently owned draw audiences. **moved** |
| `photorealCrowdLod`: finer shadow map | Tightening the map changed combined L1 to L0. | Main stays L1; shadow changes L2 to L0. | Map texel demand must not alter visible detail. **moved** |

New tests pin retained main impostors, shadow-off independence, actual single/CSM
layer routing, and shared palette indices/capacity/upload bytes. No far-readability
browser assertion, unit stat, camera or material threshold was weakened.

## Isolated numerical comparisons need equal draw history

The continuous replay gate deliberately preserves LOD hysteresis. Its numerical
reference stage constructs fresh crowds, so that stage must clear the production
crowd through its existing empty-upload boundary before the first comparison.
Otherwise equal camera/pose inputs can select different shadow geometry: on the
workbench, the mounted shadow span is10.239241 pixels, where a fresh crowd selects
L1 but an existing L2 remains below its10.5px promotion boundary. The first
class7/tick0 comparison consequently reported67,215 changed pixels/max17 despite
exactly matching joint matrices. Later oracle creation already cleared production,
which explains why only the initial comparison failed.

The focused CPU fixture confirms those actual planner selections. The browser
oracle now reports and asserts matching main/shadow histograms for production,
CPU-composed and readback-composed crowds; the unchanged≤1-channel image check
still judges their output. The continuous snapshots, culling assertions and
snapshot inventory precede the reset and remain untouched. GPU re-verification
is pending integration; no recovered pixel result is claimed from the CPU test.
