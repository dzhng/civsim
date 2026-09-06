# Appearance applicability and source timing

This pass establishes source declarations, not finished animation or controller acceptance. The [generated review matrix](../../../../../packages/soldier-assets/assets/review-matrix.json) derives selection, role bindings, clip timing and source provenance from the same producer as the complete catalog. Its acceptance link points to the existing spec roadmap; no second maturity ledger or runtime maturity flag is introduced.

Release markers belong to clips because a motion has one release point even if several appearances bind it. Source bake callers supply markers by clip name and must explicitly supply a presentation or `null` for manual-only candidates. The loader admits manual candidates without inventing battle actions. Battle admission remains the controller owner's responsibility. A single named rider-upper-body mask is declared; this pass does not implement composition or claim the seven-bone mounted placeholders are accepted horse rigs.

## Verification

From the repository root, `node packages/soldier-assets/bake/presentation.test.mjs` exercises the real HTTP loader, all generated role bindings, malformed references/markers/masks, source GLB marker propagation and rejection of frozen action samples. The first tracer failed because a swordsman's release was absent rather than explicitly inapplicable, then passed with the canonical presentation owner.

The complete `bake:test` suite passes, including source GLB/VAT tests, deterministic candidates and unchanged cards. The complete placeholder bounds probe covers 2,793,456 vertices, with maximum radius fraction 0.9149299352504724. Typecheck and the focused appearance-bundle, weighted-pipeline and material tests pass (11 tests). Against base `0cd07f1d`, all 60 mesh JSONs and the material container are byte-for-byte unchanged; all 9,408 matrix components in the eight existing clips remain exactly equal after accounting for the wider VAT stride. Three distinct diagnostic release clips are appended. Their extrema correctly update conservative bounds; no existing clip is retimed. Source diagnostic GLBs and their mesh/material/animation payloads are unchanged; only their explicit manual presentation is added.

No browser capture or visual-quality acceptance is claimed here. The parent owns runtime/controller cutover and the integrated action replay gate. Existing variant constants remain only for that caller's atomic cutover; the new descriptor table owns selection metadata.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `presentation.test.mjs` | No explicit role applicability/source marker admission proof. | Swords cannot bind release; bow/throw/crew bindings differ; HTTP errors reject malformed clip phases/references/masks; valid source markers preserve exact animation samples; frozen action rejects. | Establish the requested source timing contract. **moved** |
| `soldier-placeholders.test.mjs` | Compared generated roster against separate archetypes. | Compares against consolidated descriptors, still checks every tier/far mesh, actual posed bounds and deterministic outputs. | Remove the duplicate roster owner without weakening geometry/bounds checks. **moved** |
| `appearance.test.mjs`, `appearance-materials.test.mjs`, `material-swatches.test.mjs`, `posed-tangents.test.mjs` | Source fixtures omitted presentation intent. | Fixtures explicitly declare manual-only presentation; existing numerical assertions unchanged. | Required current-format migration, not a legacy default. **moved** |
| `appearanceBundle.test.ts`, `skinnedPipeline.test.ts` | Synthetic loader/renderer fixtures omitted presentation. | Explicit manual presentation; previous loader/material/weighted assertions unchanged. | Required current-format fixture migration. **moved** |

No simulation/stat behavior or existing screenshot baseline changed.

## Review

Independent review `01a07586-dad9-7423-810a-b81d4a18d995` found one P2: a masked-out leg could make a frozen rider action pass the source no-op check. The reproducer failed before the correction. Admission now samples local transforms through the same source sampler as the VAT bake and restricts the check to participating joints. Both leg-only and ancestor-only motion reject; inherited world motion cannot qualify as a rider action. The corrected focused tests and unchanged-output check pass. The review sandbox could not bind HTTP ports; the actual HTTP tests were run successfully outside it.

The independent follow-up found no remaining defect. Its standalone, non-HTTP probe confirmed frozen, leg-only and inherited-root-only release motion reject while masked-arm motion is accepted. Both producer call sites pass matching source rigs and baked metadata.

Shape review consolidated the former appearance names and mesh looks into one descriptor owner; runtime action history remains outside it. Source motion admission lives with baking, while runtime admission checks declarations only. The generated matrix is a review artifact, never a second input catalog.

## Decisions for the integrating ledger

**Sound, medium confidence — diagnose applicability with small distinct motions, not finished animation.** A bow observation enters a bow release motion, a throw enters a different arm action, and a crew release moves both arms. These are deliberately small source fixtures used to test timing and selection. Reusing one identically named shooting motion for every weapon would hide incorrect selection. The plan requested distinct actions but did not prescribe their exact keyframes; their visual quality remains unaccepted under the animation-review gate.

**Sound, high confidence — inspect local motion within the declared rider mask.** If a horse leg or pelvis moves while the rider's action joints stay still, the rider action cannot take credit for that movement. Source admission therefore samples the local transforms of joints it actually controls. Checking all world matrices would falsely accept movement inherited from the horse or discarded by the mask. This refines the specified no-op rejection without introducing a second pose sampler or runtime animation graph.

**Sound, high confidence — generate the review matrix as data beside the catalog.** When a source binding changes, the producer regenerates its row and the deterministic check detects stale review data. A hand-maintained markdown roster could disagree with what the loader actually reads. The matrix links to the existing spec acceptance ledger and carries no independent progress state.
