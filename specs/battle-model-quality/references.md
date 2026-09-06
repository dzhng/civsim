# Reference and planning rationale

## Visual north star

The user-supplied [Rome II phalanx-versus-heavy screenshot](assets/reference-rome2-phalanx-vs-heavy.png) is the primary target: natural anatomy, rounded helmets and shields, credible hand grips, layered leather/cloth versus mail, material-specific light response, and grounded bodies. Exact AAA fidelity is not promised. The closest gameplay camera must feel substantially more polished than the current box-built figures.

The screenshot identifies medium phalanx as leather-armored and heavy infantry as mail-armored by the user's direction. Preserve that explicit target even where older project aesthetics guidance emphasizes a different historical period. No expansion into a historical-research simulation is required.

For this 1920×1080 reference, start with the left/central phalanx bodies (approximately x0–850, y240–720), right foreground heavy armor (x1100–1750, y550–1000), and left soldier helmet/hand details (x0–700, y300–650). These are review regions, not clean isolated segmentation masks. Inspect each crop, annotate occluded parts, and save exact rectangles/masks in the first fixture manifest. Do not judge hidden feet/anatomy from occluded soldiers or compare background tiny soldiers to a hero close-up. Motion cannot be established from this still; use verified motion references and grounded contact mechanics.

Further authorized leads: [official Rome II unit spotlights](https://wiki.totalwar.com/w/Unit_Spotlight_(TWR2).html), [Rome II gallery](https://www.gamestar.de/galerien/total_war_rome_2,95215.html), and [Nomadic Tribes gallery](https://www.nuuvem.com/br-pt/item/total-war-rome-ii-nomadic-tribes-culture-pack). These were discovered as leads, not accepted angle/motion evidence. Before a new family row, inspect relevant images/videos, confirm title/unit context, and save source attribution and permitted feature-owned reference evidence. Do not treat mislabeled search thumbnails or original Rome screenshots as verified Rome II art. Reference images inform design; do not extract/repackage commercial meshes or textures.

## Primary technical research

- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html): the source contract for skin attributes, inverse binds, materials and animation. The project importer currently accepts a narrower subset; do not mistake that for a glTF limitation.
- [three.js WebGPU skinning example](https://threejs.org/examples/webgpu_skinning) and [versioned example source](https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/webgpu_skinning.html): the reason02 first reproduces skinning with an original asymmetric fixture before porting to the custom crowd. Do not import the example's third-party character.
- [GLTFLoader documentation](https://threejs.org/docs/pages/GLTFLoader.html) and [SkinnedMesh documentation](https://threejs.org/docs/pages/SkinnedMesh.html): standard-loader reference oracle; production remains the project's batched crowd path.
- [Blender glTF exporter documentation](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html): exporter reference. Online access was inconsistent during planning; verify exact options against the installed Blender exporter during02 rather than assume a newer version's defaults.

Research is not runtime proof. The mandatory replication and parity fixtures close the gap between standards and this renderer.

## Synthesis and rejected alternatives

Three independent read-only drafts used fewest-slices, risk-first and seam-quality lenses; an independent Claude Opus high-effort draft added an asset-pipeline perspective. The canonical plan combines their common conclusion: production workbench first, export/deformation/surface/playback proof before art, early cost measurements, first-pair review, then family expansion.

The minimal plan's broad repeated stages were economical but hid multiple visual verdicts. The most granular proposal clarified seams but risked plan overhead. This plan uses focused shared infrastructure and separate geometry/surface/motion slices; later family files explicitly iterate execution rows to avoid an unreviewable roster-wide patch. If a row requires several unrelated decisions, reslice it before implementation.

Rejected: a fixed large bone count or universal Uint32 indices without measurement; no-op shooting clips to satisfy a blanket registry; permanent generated-placeholder fallback; hard-blocking approval for reversible art; and combining anatomy, armor, materials and motion in a single hero-image pass. These obscure cost, coverage or the actual cause of visual improvement.

Blender is chosen for direct, reproducible source authoring—not because an AI model is presumed superior to another. External AI generation remains excluded by the user's latest instruction. Available asset-service toggles do not alter that scope. Uniform appearance and unpaired motion deliberately defer two separate sources of complexity.

## Fog and scrollback audit

All unresolved questions in the exploration map now have an owner: export/composite rig02–03; material identity04; role clips and observations05; sampling06; measured geometry/texture/live budgets07; remaining historical gear17/21/25; complete consumer cleanup30. These are gated experiments with outputs, not unbounded design permission.

Recurring risks were resliced: locomotion versus combat versus reaction versus equipment transitions; mounted form versus materials versus gait versus actions; geometry detail versus LOD continuity. The remaining freedoms are listed in each slice. A new subsystem, changed quality target, weaker gate or unsupported gameplay event is not delegated discretion.

The materialized-plan seam audit caught and resolved four dependencies: GLB replacement follows the new bake contract rather than preceding it; artillery equipment must be reauthored from its currently embedded geometry; mounted rider actions require a bounded local-transform mask over gait, proved before budget measurement; and detailed candidates enter production only as complete distance-ready bundles. These choices prevent temporary importers, disappearing artillery, gait interruption during ordinary rider attacks and concealed mixed-quality LOD bundles.

The plan preserves the first-two-model presentation, all-roster endpoint, local authoring, no AI service, no paired combat, no appearance randomization, uniform class identity, rig/animation work, reference research and unchanged gameplay/save contracts. The previous kickoff prompt and OPEN list are superseded. No model, animation, performance result or visual fix is claimed shipped by this planning pass.
