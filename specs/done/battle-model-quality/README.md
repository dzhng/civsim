# Authored battle models

Battle models give the existing roster readable bodies, equipment and motion
without making animation a second simulation. The visual direction comes from
the user-supplied [Rome II reference](assets/reference-rome2-phalanx-vs-heavy.png):
natural proportions, layered clothing and armor, distinct materials and grounded
figures at gameplay distance—not an exact AAA fidelity promise.

The authored roster is the production default. The
[integration evidence](assets/evidence/30/integration.md) records source
reproduction, consumer verification and the retained limits. The
[ownership map](visualizations/roadmap.html) links the source, observation and
rendering boundaries; the [final choices](choices.md) explain the decisions.
The [main integration check](assets/evidence/final/main-integration/README.md) records
merge validation and retained browser limits.
The [final review](assets/evidence/final/archive-review.md) records evidence
scope and archive integrity.

## Why these boundaries matter

**The engine decides; the model depicts.** Orders, displacement, equipment, hits,
firing and death remain authoritative observations. A missing windup signal does
not authorize delaying a projectile, and an attack gesture does not assert a
successful strike. Gaits use calibrated travel rather than assuming that a run
order means a body actually ran. Completed-interval presentation aligns the
displayed body and pose without predicting future movement; its batch timing is
an explicit approximation, not exact reconstruction of collisions. The
[timeline](../../../packages/crowd-runtime/src/actionTimeline.ts) and
[consumer tests](../../../web/tests/battleCrowd.test.ts) own these boundaries.

The [injury observation contract](assets/evidence/05/injury-observations.md)
uses health loss, not contact/facing timers: several injuries can merge between
observations, without identifying a particular successful strike. Body-attached
cues share presented time; commands, detached projectiles and the environment
retain their existing clocks. Ordinary pause holds the displayed fraction;
explicit freeze selects the authoritative endpoint. The
[live presentation record](assets/evidence/11/live-consumer/review.md) owns those
limits and lifecycle decisions.

**One asset identity reaches every consumer.** Battle, campaign, workbench,
portraits and motion review must agree about which appearance and action is
shown. The [appearance registry](../../../packages/soldier-assets/src/appearance.ts)
and [roster baker](../../../packages/soldier-assets/bake/roster.mjs) replace copied
rosters and guessed clip names. Inapplicable actions remain absent; inspection
clips and synthetic fixtures are not gameplay substitutes. A failed replacement
must not publish a partially built catalog. The
[real-loader source check](../../../packages/soldier-assets/bake/roster.test.mjs)
pins published coverage and loaded asset meaning; the baker owns catalog publication.

**Authored pose owns geometry.** Skinning retains weighted joints and hierarchy;
interruptions preserve the composed pose rather than snapping to a nearby clip
endpoint. Mounted upper-body actions leave the horse and seated lower body on
their gait. Compatible equipment rigs can retain body pose when equipment changes
immediately, without pretending to animate a pike into a sword. Death owns its
final shape: a second procedural corpse roll would change the authored orientation
and ground relationship, so it is not an extra source of variation.
Simulation-owned world travel does not authorize stripping
authored pelvis, mount-bob or fall translations from the local pose. The
[asset contract](../../../packages/soldier-assets/src/appearanceBundle.ts)
and [timeline tests](../../../web/tests/actionTimeline.test.ts) are the code entry
points; the [decision record](choices.md) explains the trade-offs.

**Production rendering is the visual judge.** A flattering Blender render cannot
prove the game's skin, materials, shadows or loading behavior. Review uses the
production workbench and shared deterministic capture path. The isolated
standard-loader fixture is an independent export oracle, not an alternative
product renderer. Camera-visible and
shadow-visible bodies have independent representation needs; neither audience
may disappear merely because the other is culled. See the
[crowd LOD owner](../../../packages/photoreal-renderer/src/battle/crowdLod.ts) and
[production review evidence](assets/evidence/30/production-review-drivers/artifact-review.md).
Posed normals must reach native geometric roughness as well as custom lighting;
otherwise numerically correct joint transforms can still shade differently from
the same geometry posed before upload. The
[isolated shader proof](assets/evidence/final/posed-geometric-normal.md) separates
that rendering requirement from floating-point matrix tolerances.

## Local source and visual provenance

Models, fitted equipment, rigs and action keys are locally authored Blender
sources. The [saved sources](../../../packages/soldier-assets/assets/source/) and
[authoring/export recipes](../../../packages/soldier-assets/bake/) remain editable;
runtime reductions do not replace those originals. No downloaded commercial mesh
or external AI-generated soldier is part of this authoring approach. Artillery
equipment stays a rigid root-attached part of the crew bundle, not a new prop
renderer or coordinated machine simulation.
The [saved-source reproduction](assets/evidence/final/saved-source-reproduction/README.md)
proves export, reduction, bake and loader admission from a clean extraction of
the final saved assemblies, not merely from their previously exported GLBs.

[Reference attribution](references.md) distinguishes the user's primary image
from inspected promotional stills and unverified leads. The
[evidence archive](assets/evidence/) retains reference, comparison and rejected-result
imagery; individual reports distinguish archived captures from scratch-only diagnostics.
Historical reports retain their original revisions and command records; current
authoring entry points live with the bake owner rather than the retired plan.
Static references guide form and materials; they cannot establish motion or
contact. Evidence scopes matter: portraits may crop pole tips, full-kit sheets
inspect equipment extent, and the named live body-region gate does not certify
the excluded HUD.

## Approaches not to repeat

- Predicting future roots to conceal a root/phase mismatch introduces motion the
  engine has not produced. Keep the bounded presentation-time contract instead.
- Reusing full-detail geometry at every distance hides cost behind tier labels.
  Actual offline reductions are required, but aggressive reduction that removes
  body surfaces is not a usable far representation. The
  [LOD study](assets/evidence/15/actual-mesh-lod/delivery.md) preserves both outcomes.
- Placeholder fallback, no-op role clips and a separate beautified review shader
  conceal missing delivery instead of proving it.
- Pinning fresh-export tangents or relaxing screenshot tolerances to obtain green
  images confuses source equivalence with raster identity. Preserve causal
  diagnostics and explicitly reviewed baseline changes.
- Treating a commanded walk as proof of walking cadence rejects legitimate
  observed run intervals. An interval crossing a gait change still advances by
  its preceding gait's stride; the new destination does not retroactively own
  distance already travelled. The [live trace](assets/evidence/30/gait-cadence/review.md)
  records the distinction without changing the engine to satisfy the fixture.

## Deliberately retained limits

The user accepted the current visual quality and requested overall delivery
instead of further per-piece refinement. [Visual follow-ups](follow-ups.md) retain
the remaining anatomy, material, grip, contact and motion-readability work.
Uniform appearances and unpaired actions are intentional; facial animation,
ragdolls, runtime foot IK and coordinated artillery choreography are outside scope.

The original performance threshold remains unchanged and unmet. The user
explicitly accepted a [documented performance follow-up](../sim-perf/model-rendering-follow-up.md),
not a passing timing result. Existing measurements include workload and machine
contention caveats; they do not prove full live-battle frame rate. This acceptance
does not waive missing actions, broken loading or unfinished production consumers.
