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
shadow camera contains them. The finest contributing footprint wins under the
unchanged pixel thresholds and hysteresis. Shadow footprints use the actual
orthographic camera and map resolution. Their minimum representation is the
coarsest mesh; all three mesh tiers now cast, while sprites remain non-casters.
The [choice ledger](../../../choices.md) owns that explicit caster-policy decision.

No camera rig, light, simulation, asset, framebuffer setting or numeric threshold
changed. The existing skip-tier hysteresis behavior is preserved, including its
conservative retention when a jump lands inside a coarser boundary's deadband.
Production telemetry separates view-visible and shadow-only bodies from their
union, so a submitted caster is not mistaken for an on-screen soldier.

## Evidence and remaining gates

At the saved closest gameplay camera, a mounted reference at `(0,150,0)` measures
**15.4346348194 pixels** using the camera-facing span. The old radial-focus ruler
reported21.306 pixels. Independent projection of an upright2.61m segment reports
15.842 pixels: this demonstrates the old mismatch, not the new method's formula.
Both correct projections cross the existing L0 exit boundary without retuning.

The focused projection, LOD, camera bridge, synthetic-asset and mounted-timeline
tests pass together:24 tests. Typecheck passes. Tests construct the actual
production THREE mesh to verify that the tier selected for a shadow-only body
really casts. Source review caught and corrected a proposed tier2 floor that
initially disagreed with the old finer-only casting flags.

GPU work is reserved for integration: production before/after captures, final
unprimed critique, standing30k gate and matched animated-budget sweeps remain
unrun for this source checkpoint. No visual fix or measured art budget is claimed.
Pre-existing screenshot differences must not be attributed to this correction.

## Changed-test ledger

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
