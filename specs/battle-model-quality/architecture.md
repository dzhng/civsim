# Ownership and contracts

## One owner per concept

| Concept | Owner and boundary | Consumers and removal rule |
| --- | --- | --- |
| Authored soldier source | `packages/soldier-assets`: Blender source, export/bake scripts and provenance | Keep .blend and reproducible local scripts; generated GLB/bakes are rebuildable. Do not create an independent art package with another schema. |
| Gameplay roster | Existing simulation/class-data owner | Appearance catalog references classes; never copy combat stats into art metadata. |
| Appearance and applicable clips | `soldier-assets` canonical catalog | Battle state selection, loaders, workbench, cards and sheets consume it. Consolidate duplicated render descriptions and blanket clip lists. |
| Asset encoding | `soldier-assets` local animation producer/decoder, shared resolved playback packing in `renderer-core` | Weighted meshes landed in03;06 replaces matrix animation with authored-time local transforms in all consumers together. Reject unsupported source constructs at authoring boundary rather than silently degrading. |
| Action progress | `crowd-runtime` per-soldier timeline | Battle adapter supplies observations; renderer samples outputs. Eliminate global-time action restart/wrap and duplicate switch clocks. |
| Skin/material/LOD | Existing `photoreal-renderer` crowd and shared crowd LOD owner | Workbench reuses production composition; no lab-only soldier shader. Reduced meshes and per-appearance impostors consume the same authored asset. |
| Environment | Existing production world | Harness controls camera/time, not a competing light rig tuned to flatter art. Neutral standard-loader oracle only tests export. |
| Visual evidence | Existing named scene and `snapCheck` infrastructure | Sheets/animation frames/cards reuse shared capture; no new generic screenshot runner. |

## Source-to-runtime contract

Use one current appearance-bundle format replacing the optional class-mesh/VAT override model. Rebuild its producer and consumers together; do not introduce format negotiation, legacy readers or migration scaffolding for these internal artifacts. Required fields link an appearance to a skeleton, explicit material set, clip set, real mesh tiers, far representation and conservative animated/equipment bounds. Shared rigs/textures/clips are referenced, not duplicated per soldier. Temporary placeholders are ordinary bundles in this same format.

The weighted vertex contract preserves position, normal, tangent, UV, up to four normalized joint weights/indices and explicit material/faction identity. Texture references declare color space and sampling conventions. Index width is explicit and validated against vertex count; never silently truncate to Uint16. The importer must preserve joint ancestry, object transforms and inverse binds or reject the export with a specific corrective error. The supported authored subset uses baked deform animation and a single composite deform skeleton per exported mounted appearance. Control rigs do not enter runtime.

Canonical mesh attributes remain separate typed arrays in `soldier-assets`; both GPU substrates pack them through one shared layout at upload. This avoids maintaining two layouts and keeps the production shader below baseline WebGPU's vertex-buffer limit. Joint indices reference the complete required ancestor hierarchy, not only Blender's deform-bone list. Import preserves glTF coordinates; the asset bake owns the single conversion into engine coordinates. The authored subset uses positive uniform transforms and LINEAR or STEP sampled channels; unsupported transforms/interpolation fail at import with corrective export guidance instead of silently changing deformation.

Clip metadata carries duration/sample timing, looping versus terminal hold, applicability and any release/attachment markers. The catalog requires meaningful clips per role, not no-op shooting on a swordsman. The controller emits source/destination pose samples and blend state, including a bounded frozen local-pose source when an interruption cannot be represented by a clip sample. Skin/shadow sampling must agree; phase1 of a nonloop is the final sample, not modulo0. Locomotion is authored in place because the simulation supplies world travel. If a future source contains travel, factor it from an explicitly declared motion root during authoring; never generically zero imported ancestors, pelvis motion or death displacement, which belong to the authored shape and pose.

A role/state matrix is an implementation artifact generated from the catalog during05 and expanded as art lands. Common presentation needs are ready/at-ease, locomotion, attack where applicable, observed hit, and terminal death; ranged, brace, carry and sidearm states apply only to corresponding roles. Existing render variants are not new simulation classes. Consult [class data](../../web/src/battle/classData.ts) and [current appearance construction](../../packages/soldier-assets/src/soldierMesh.ts); older model-sheet guidance has stale class-number examples and must not override code.

### Mounted composition and candidate promotion

Mounted playback has one authored rider-upper-body override mask over the locomotion base: spine/arms/head may act while horse, rider pelvis and seated legs retain gait. Compose local joint transforms before hierarchy evaluation; masking world-space bone matrices is not equivalent. Death overrides the whole composite; hit reactions may interrupt the full body. No general animation graph or additive stack is required. Prove this in02/06 and include its cost in07 before accepting detailed exported art; it need not delay editable human anatomy candidates.

`soldier-assets` owns local-pose evaluation from imported tracks and the sampled GPU encoding's semantics; `crowd-runtime` owns action history and frozen interruption sources, not a second pose sampler.05 establishes exact CPU interruptions before06 changes GPU data. An overlay exits toward the evaluated advancing base, not merely its destination clip. The bounded source lifetime, cutover sequence and continuity proofs live in [06](./slices/06-gpu-playback.md#bounded-interruption-contract); repeated interruptions must not grow an expression tree or substitute a nearby endpoint.

Exact frozen storage must fit each GPU binding even when every body has distinct
base and upper sources. Two banks share the packer's logical slot space; their
stable parity mapping preserves identity sharing and holes without moving poses
as visibility changes. Each bank is bounded by retained admitted output capacity,
not current live count. The [storage correction evidence](assets/evidence/07/snapshot-banks.md)
records the proof and remaining workload gates; it is not a total-memory promise.

Slice03 establishes the complete tier/bounds/far schema and loader using converted placeholder bundles. Until authored reductions/far/bounds pass15 or28, detailed art is a **workbench candidate**, not a production replacement. Promote the complete appearance atomically and remove its placeholder content then. The removal rule below refers to complete bundle acceptance, not an earlier geometry/material verdict. Never hide authored-near/placeholder-far mixtures.

Artillery equipment currently lives inside soldier mesh construction, not a separate production prop. Slice25 reauthors the existing equipment locally as a rigid component of the class8 bundle, with explicit root attachment and current placement semantics. It uses the same asset owner, not a new artillery renderer; geometry, surfaces and crew contact are judged in25–27 without new artillery mechanics.

## Action observations, not invented events

Current firing TTL is set when the projectile fires; it is not automatically an advance draw cue. Hit TTL exists internally, but inspect its precise coverage and reset semantics before treating it as every melee/ranged hit. Slice05 must record each observable event, consumer, reliable edge and unavailable information. Add a minimal read-only presentation accessor if needed and pin unchanged sim results. Generic fighting can animate unpaired attack effort; it cannot fabricate a specific successful strike or victim reaction.

A release observed too late for a full windup enters the release-compatible clip phase. Never delay gameplay projectile emission to fit animation. Death has highest terminal priority; other interruption rules and blends are delegated only with deterministic replay tests. Clear controller state on battle reset, identity reuse and time reset; preserve pause determinism. No exact attack-contact guarantee is promised without an authoritative signal.

## Cutover and transitional content

In03, update all old format consumers or remove obsolete dev-only ones; no v1 loader, optional override or dual skinning path survives that slice. Convert existing placeholder content to the new encoding to keep the entire roster runnable. Its explicit removal condition is acceptance of that appearance's authored replacement; no class silently falls back once replaced.

The standard-loader fixture from02 remains an isolated export test oracle, not a second product renderer or downloadable-asset path. The obsolete raw soldier review route and scripts migrate to the production workbench at their earliest replaced consumer; any remaining cleanup is tracked in30. Preserve unrelated raw renderer experiments.

Budget selection is a measured experiment in07, not an arbitrary promise of a particular polygon count, bone count or texture resolution. Once measured, write the chosen limits into that slice and executable bake checks. New detailed classes must stay inside that envelope or trigger a focused optimization/reslice. Editable08 anatomy and09 first-pair equipment sources may be authored alongside07 with provisional counts. Equipment uses the provisional rig and must be refitted after relevant anatomy changes; unclothed anatomy acceptance stays independent. Acceptance and production promotion remain gated. Bounds include long weapons, mounted bodies and animation extrema.

## Risk retirement and executable anchors

Use the existing [glTF tests](../../packages/soldier-assets/bake/gltf.test.mjs), [local hierarchy tests](../../packages/soldier-assets/bake/local-hierarchy.test.mjs), [animation-state tests](../../web/tests/animationState.test.ts), [material tests](../../web/tests/soldierMaterials.test.ts) and [battle scenes](../../web/scenes/battle) as starting seams, not immutable implementation assertions. Replace tests that encode box geometry, RGB material guessing or global action phase with behavior-oriented cases, and report the behavior change.

Before implementation choose exact new scene/CLI names within the existing runner. The route and probes in slice files are proposed deliverables; this spec does not claim they already run. A clean-checkout source export, full asset load and real battle are mandatory final proofs, not merely passing offline bake tests.
