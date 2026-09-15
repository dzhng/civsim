# 10 — Coherent lighting and landscape composition

Status: pending. Dependencies: [05](05-terrain-material.md), [07](07-ecological-placement.md), [09](09-water-response.md).

## Contract and owner

Use CIVSIM_ENVIRONMENTS and applyCivsimEnvironment as the only environment owners. Fit campaign shadows to visible geometry and relevant casters with the existing world/camera contract.

Slice variable: **Lighting, shadow and atmospheric treatment over fixed accepted assets.**

## Work

Tune the campaign environment to bright Mediterranean grass, warm stone, readable cool shadows and restrained aerial depth. Remove baked campaign light from physical material inputs. Keep cloud/parchment framing at overview where it supports the campaign identity; do not let haze erase the close landscape. Verify shadows across close/regional/overview transitions without acne, giant detached shapes or caster popping. Battle retains its existing weather presets over the same materials. After tuning, compose all accepted variables in full regional frames and assess the whole reference bar before production migration proceeds.

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

## Normal-transform audit before lighting tuning

The current scenery position shader scales XY by instance size and Z by optional instance height, but rotates its authored normal without the corresponding inverse scale. Audit this when height and width differ, as they do in campaign planting. Correct that shared normal transform before compensating with environment values; preserve deliberate crown/card normal direction and verify both uniform and nonuniform instances.


### Instance normal checkpoint

The shared instance shader now applies inverse-transpose scale before yaw. The
independent baked-geometry fixture covers uniform, tall and wide rock/tree pairs;
the former code fails its precision bound while uniform scale stays exact.
See [normal evidence](../assets/slice-10/normals/README.md). This correctness fix
precedes environment tuning and does not complete lighting/composition acceptance.

## Accepted visible-view shadow fitting

The shared single-sun rectangle fit now follows campaign's full canonical view
footprint, with light-space texel stabilization. Clipping to world bounds was
rejected because it changes resolution during fixed-zoom edge pans. Battle's
existing fit is preserved. Matched city comparisons, exact repeats and sampled
hardware edge/interior pans accept the bounded improvement in attached shadows.
See [evidence](../assets/slice-10/shadow-fit/README.md). Roof banding, full canopy
composition, overview transitions and the complete environment target remain open.

## Composed battle audit follow-up

The [current battle vistas](../assets/slice-13/composed/README.md) retain readable near formations but fresh critique finds yellow haze suppressing far terrain and enemy lines, with a weak visible transition from battlefield to distant walls. Investigate atmosphere/material/vista presentation together while preserving playable terrain. Exact-repeat captures prove deterministic output, not final environment quality.
