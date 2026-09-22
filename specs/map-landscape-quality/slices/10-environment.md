# 10 — Coherent lighting and landscape composition

Status: normal transforms, stabilized campaign shadows and shared aerial-ray correction accepted; whole-frame lighting remains open. Dependencies: [05](05-terrain-material.md), [07](07-ecological-placement.md), [09](09-water-response.md).

## Contract and owner

Use CIVSIM_ENVIRONMENTS and applyCivsimEnvironment as the only environment owners. Fit campaign shadows to visible geometry and relevant casters with the existing world/camera contract.

Slice variable: **Lighting, shadow and atmospheric treatment over fixed accepted assets.**

## Work

Tune the campaign environment to bright Mediterranean grass, warm stone, readable cool shadows and restrained aerial depth. Remove baked campaign light from physical material inputs. Keep cloud/parchment framing at overview where it supports the campaign identity; do not let haze erase the close landscape. Verify shadows across close/regional/overview transitions without acne, giant detached shapes or caster popping. Battle retains its existing weather presets over the same materials. After tuning, compose all accepted variables in full regional frames and assess the whole reference bar for final integrated acceptance.

## Runnable checkpoint

Planned landscape-environment scene plus campaign-landscape full frames in several climates; battle preset comparisons use existing environment routes.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Run environment/color tests, shadow and camera transitions, plus direct whole-landscape comparison. No geometry/material-density edits during lighting comparisons. If the full frame fails due to another variable, return to its owning slice instead of compensating through grading.

Crop/mask: Whole frame plus lit/shaded face, tree contact and far-distance crops. Asset shape, planting distribution and water geometry/material profiles are frozen.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Preset values and bounded shadow fit/quality policy are delegated. One environment owner, bright readability, stable shadow transforms and no material-local haze are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Lighting mood preferences change preset values. No human response is required to choose the reference-consistent default.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Accepted checkpoints and their limits

| Checkpoint | Evidence and retained boundary |
| --- | --- |
| Instance normal transform | [Normal evidence](../assets/slice-10/normals/README.md) accepts inverse-transpose scale before yaw for uniform and nonuniform instances. Preserve deliberate crown/card normals; this is correctness, not lighting/composition acceptance. |
| Visible-view shadow fit | [Shadow evidence](../assets/slice-10/shadow-fit/README.md) accepts attached shadows with stabilized campaign view fitting. Clipping the fit to world bounds was rejected because fixed-zoom edge pans changed resolution. Battle's fit remains its existing policy. |
| Shared aerial ray | [Ray evidence](../assets/slice-14-production/aerial-ray/README.md) accepts consistent normalized-ray intersection and integration. This does not establish atmosphere density or distant battle readability. |
| Campaign chart atmosphere | [Chart evidence](../assets/slice-10/chart-atmosphere/README.md) accepts chart-scale optical depth and preserved regional/close output. Angular peripheral mountains and the composed concealment/readability judgment remain open. |
| Controlled production composition | [Merged proof](../assets/integration/production-shadow/README.md) accepts scoped contact, UI and water continuity with exact repeats. Regional reference quality remains a separate gate. |
| Screen-space output | [Output mechanism](../assets/slice-10/screen-output/README.md), [production replay](../assets/slice-14-production/remaining-acceptance/screen-ui-production-control/README.md) and [attachment retirement](../assets/slice-15-retention/screen-ui-production10/README.md) prove the shared output boundary, preserved world pixels and scoped lifetime. Final DPR/performance and current integrated lifetime remain open. |

## Remaining composition acceptance

Judge roof banding, canopy contact/composition, close-to-overview transitions and
the full Mediterranean environment target through current production. Keep
geometry, planting and material profiles fixed while testing lighting. A failure
owned by form or material returns to that owner rather than being hidden by
haze or grading.

The [historical battle audit](../assets/slice-13/composed/README.md) found distant
terrain and enemy lines suppressed by yellow haze and a weak field/vista join.
Reassess those properties through current TypeGPU production; the old Three
captures neither establish a present defect nor accept the migrated consumer.
Preserve playable terrain and weather semantics. The common
[integrated matrix](15-acceptance.md) owns the final world/camera comparisons,
strict repeats, hardware and unprimed critique.

## Screen-output invariants

The pinned Three renderer grades in a global output pass; material
`toneMapped=false` alone does not exempt screen ink. Keep source UI colors,
opaque and translucent blending, and world pixels outside UI influence intact.
The [rejected direct-draw proof](../assets/slice-10/screen-output-first/README.md)
records why a second draw that replaces world samples is invalid. Restore both
renderer target selectors before the final copy and retain one renderer, canvas,
time and output owner. Do not compensate with brighter ink, inverse-tone-map
hacks, a new setting or a second permanent post chain. Battle readout placement
and depth semantics remain their current owner's responsibility.

The old whole-image brightness floor is superseded by the independently tested
[label-owner controls](../assets/slice-12/label-owners/README.md), not an open
requirement to raise unrelated bright pixels. Preserve missing-owner detection
and its documented card-only precision boundary. Broader typography, DPR,
label/scenery policy and presentation quality remain under
[12](12-campaign-entities-labels.md); current integrated resource and performance
acceptance remains under15. Do not reopen the accepted output mechanism solely
to repeat its completed proof.
