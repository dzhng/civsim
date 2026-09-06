# Battle model quality — completed exploration map

Exploration completed 2026-09-06. This is the four-quadrant handoff, not a shipped
feature or a build plan. User decisions are closed; measured implementation
choices are now assigned to gated slices in the [implementation plan](README.md).
This map is historical exploration evidence; the plan owns all next actions.
At exploration completion no models or renderer behavior had changed. For current implementation status, use the plan's Next Agent Prompt, not this historical snapshot.

## Known knowns

- The supplied `assets/reference-rome2-phalanx-vs-heavy.png` defines the intended
  quality and tone: medium phalanx in leather armor versus heavy infantry in mail.
- Author meshes, materials, skeletons and animations directly in Blender. Export
  through glTF/GLB into the production three.js crowd pipeline. External AI model
  generation is excluded by David's latest instruction.
- The worktree is `/Users/david/dev/game-battle-model-quality`, branch
  `codex/battle-model-quality`.
- Existing geometry is box-built (`packages/soldier-assets/src/soldierMesh.ts`).
  The existing skeleton has seven bones and no elbows or knees
  (`packages/soldier-assets/bake/soldier-placeholders.mjs`).
- Existing sheets cover 20 appearances, eight angles and four poses
  (`web/shots/models/scripts/soldier-sheets.mjs`), but the lab uses the raw crowd
  renderer (`apps/renderer-lab/src/labShell.ts`) rather than production's
  `PhotorealBattleWorld` (`web/src/battle/renderer.ts`).

## Known unknowns — resolved or explicitly deferred

| Decision | Why / source |
| --- | --- |
| Rebuild skeletons and individual animations with the models. | David explicitly included attack, run, walk and other animation support. |
| Use the nearest soldiers in the supplied screenshot as the closest gameplay quality target. | David confirmed this viewing-distance proposal. |
| Gather additional Rome II references for angles and other unit types. | David explicitly authorized reference research. |
| Keep appearance uniform within each class; defer individual variation. | David's latest decision; keeps this spec focused on base model and animation quality. |
| Defer paired combat to a future spec. | David prioritized good-looking models and individual animations. |
| Preserve the existing 30k renderer budget of 33 ms; measure animated close views too. | Existing benchmark `web/scenes/battle/battle-perf-30k.mjs`; disclosed to David. This pauses simulation and is not proof of live battle performance. |
| Improve the harness and prove heavy infantry plus medium phalanx before extending across the roster. | David confirmed the first-two-unit review checkpoint; whole-roster quality remains the objective. |

Exact clip inventory, mesh/material budgets and hardware-specific close-view limits
remain OPEN for code/rig inventory and measured prototype evidence. They are not
permission to select arbitrary values silently.

## Unknown knowns — confirmed by David

Confirmed reading of the reference: natural proportions and curved silhouettes;
recognizable face, hands and grips; layered leather/cloth versus textured mail;
material-specific highlights under warm daylight; grounded, weight-bearing motion.
Close scrutiny serves playable battle views and formations. Individual variation
and paired combat are excluded.

Review expectation: present the first two models in the actual game renderer,
through close turnarounds, animation loops and a small formation, before extending
the construction approach. The plan's slice16 defines the non-blocking review
window and evidence-based decision; silence is not explicit user approval.

The consumer is David reviewing playable battle quality. Blender previews are
authoring aids; exported production-rendered turnarounds, loops and formations
are the acceptance evidence. Uniform appearance does not imply synchronized
animation; soldiers still react to their own movement and combat states.

## Unknown unknowns — risk sweep

Coverage: targeted inspection of the existing model generator and metadata,
skeleton/clip bake, glTF adapter and tracer, asset schema/loaders, crowd instance
and animation state, frontend battle presentation, production crowd/material/LOD
and impostor paths, lab/sheet capture and 30k benchmark. This is coverage of the
identified integration seams, not a claim to have exhaustively audited the repo
or every file a future implementation will touch. Findings are code-inspection
evidence; no runtime regression or performance verdict is claimed.

| Status | Evidence / landmine | Why it bites and what changes |
| --- | --- | --- |
| Decided direction | At exploration, the former mannequin tracer selected one joint and emitted flat color through a narrow stride-11 mesh format. | Blender deformation and material detail would be lost. Preserve blended skin weights and explicit surface channels through export, bake and production rendering; prove the round trip before detailed asset work. |
| Decided direction | [Animation selection](../../packages/crowd-runtime/src/animationState.ts:65) uses global repeating phase for attacks/hits/shots; [instance construction](../../packages/crowd-runtime/src/instanceData.ts:69) supplies no death age; [GPU upload](../../packages/photoreal-renderer/src/battle/crowdLayer.ts:220) wraps phase 1 back to 0. | A death cannot reliably play then hold; attacks can begin mid-motion. Add render-owned action progress, non-looping end holds and transitions. Keep simulation authoritative for positions and outcomes. |
| OPEN: event detail | [Frontend combat presentation](../../web/src/battle/battleCrowd.ts:248) chooses synthetic fighting beats and reads missile loosing state. | Polished clips alone do not guarantee contact/release timing. Inspect available sim event timing before specifying hit reactions and release markers; expose presentation data only if needed, without changing combat balance. |
| Decided direction | [Production mesh override](../../packages/photoreal-renderer/src/battle/battleWorld.ts:245) uses one imported mesh at every tier; [far atlas](../../packages/photoreal-renderer/src/battle/crowdLayer.ts:121) is built from class 0. | Detailed imports can erase the performance benefit of LOD, and distant cavalry/pikes can inherit the wrong silhouette. Carry real reduced-detail assets and class-appropriate far silhouettes, verified across zoom transitions. |
| Sharp edge | [glTF adapter](../../packages/soldier-assets/bake/gltf.mjs:152) reads the first skin; parent resolution only recognizes immediate joint parents, and animation decoding ignores non-joint channels and sampler interpolation modes. | Blender controls, object transforms and multiple armatures need deliberate export rules. Bake controls into deform-bone animation; validate axes, scale, hierarchy and supported interpolation instead of silently accepting lost data. Horse/rider export composition stays OPEN pending a fixture. |
| Decided direction | [Material shader](../../packages/photoreal-renderer/src/battle/crowdLayer.ts:355) guesses materials from RGB and varies color by seed. | Leather/skin/bronze colors can collide as identifiers, and appearance variation conflicts with the current scope. Use explicit material identity and uniform per-class authored appearance, retaining faction identification. |
| Sharp edge | [Culling bounds](../../packages/photoreal-renderer/src/battle/crowdLayer.ts:185) use fixed human/horse spheres. | Long pikes and animation extremes may leave the bounds. Derive or validate bounds against equipment and animated extents; include screen-edge and shadow checks. |
| Decided direction | [Lab pipeline](../../apps/renderer-lab/src/labShell.ts:232) differs from [production](../../web/src/battle/renderer.ts:331). | A beautiful lab frame could misrepresent gameplay. Use the production asset/material/animation/light path in the review harness. |
| Sharp edge | [30k benchmark](../../web/scenes/battle/battle-perf-30k.mjs:122) pauses simulation; viewport is 1280×800. | Preserve this gate, but do not equate it with live close-view performance on David's display. Add measured live animated views and record hardware/resolution. |

Prior work: [incoming provenance](../../packages/soldier-assets/assets/incoming/PROVENANCE.md)
records an unaccepted human/horse import experiment, including a spell animation
standing in for bow shooting. It proves part of the bake path, not finished
roster assets. Do not adopt those assets or clips as an implicit shortcut to the
current direct-authoring decision.

## Former OPEN items — superseded by the implementation plan

The following list preserves exploration rationale, not a request to repeat the
interview. [Research and decisions](references.md#fog-and-scrollback-audit) map
every item to its owning gated slice; [architecture](architecture.md) owns the
selected contracts.

- **Per-class clip matrix:** inventory every gameplay and weapon-state variant,
  then specify idle/ready, walk/march, run, attack, hit, death and applicable
  ranged, brace, carry and sidearm transitions. Map horse/rider and artillery
  motion explicitly. Close with a reviewable roster-to-clip table before baking.
- **Rig and export contract:** choose deform skeleton, attachment names, weights,
  material/texture layout and horse/rider composition using a minimal exported
  bending-joint/equipment fixture. Validate rest pose, scale, facing and animation
  through the actual crowd path before authoring the first detailed pair.
- **Geometry, texture and animation budgets:** compare first-pair quality and
  measured GPU/CPU/memory cost, then record the selected LOD, texture and playback
  budgets. Do not weaken the existing 30k/33 ms benchmark silently.
- **Live close-view performance:** record target hardware, viewport and battle
  load with the prototype; disclose baseline and select an explicit threshold.
- **Historical equipment for the remaining classes:** inspect additional Rome II
  sources and map recognizable equipment to the game's actual roles; resolve
  ambiguous classes before their models are built. Reference galleries are leads,
  not yet verified images.
- **Combat timing:** inspect event availability and propose the minimum
  presentation-state changes needed for credible attacks, shots and deaths.
- **Secondary motion:** finger articulation, facial animation, cloth simulation,
  foot IK and ragdolls are not promised by the current map. Record which simple
  authored deformations suffice in the first-pair review; raise any proposed
  subsystem expansion explicitly.

These are bounded prototype questions, not unspecified artistic freedom to lower
the confirmed quality target. The implementation plan stages their evidence gates.

## Additional reference sources

- [Rome II screenshot gallery](https://www.gamestar.de/galerien/total_war_rome_2,95215.html)
- [Nomadic Tribes screenshot gallery](https://www.nuuvem.com/br-pt/item/total-war-rome-ii-nomadic-tribes-culture-pack)
- [Official unit spotlights, including ranged and cavalry movement](https://wiki.totalwar.com/w/Unit_Spotlight_(TWR2).html)

These are discovered reference sources, not yet a fully inspected or approved image set.

## Previous kickoff — fulfilled and superseded

The requested sliced spec is materialized in [README.md](README.md). Follow its
Next Agent Prompt rather than restarting exploration or writing a second plan.
