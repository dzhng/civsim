# Production candidate workbench — 03d evidence

## Target and verdict

The production renderer must preserve the exported fixture's silhouette, weighted bends and equipment attachment at the same source poses and camera. Its sun-shadow pass must follow those poses. This is a deformation/import checkpoint, not acceptance of soldier anatomy, material fidelity or animation quality.

The human and mounted complete candidate bundles load through the same catalog loader and production world as the roster. A catalog URL selects a whole candidate collection; it is retained across reloads and never installs a per-class fallback. The production catalog remains unchanged. The route describes offline GLB baking explicitly: source import errors belong to the bake command; a failed bundle reload is displayed in the workbench while the last good image remains.

Accepted for static deformation correspondence. Direct inspection and fresh unprimed review found matching elbow/knee curvature, shield angles, horse leg swing and rider poses. No production-only missing limb, detached attachment or framing mismatch was visible. The two composed mounted source samples remain numerical source-retention evidence, not runtime clips; local-track composition belongs to 06.

## Capture and comparison

`blender-production-candidates` uses the existing production workbench and default environment, shadows and post chain. It derives the camera target and scale from the same union of source landmark poses used by the standard-loader oracle. Each source time is divided by the matching authored clip duration. Front/side yaw, pitch, 1280×800 viewport and frozen environment time match the oracle's framing contract. Every pose is rendered again before its byte-stability comparison.

The [production sheets](production/) and [reference sheets](reference/) contain the same direct-clip samples. The mounted reference's final two composition rows are omitted from this comparison because no corresponding runtime clip is claimed. [Detail crops](crops/) retain the elbow, knee, shield, rider, gait and shadow surfaces. The [comparison report](comparison/visual-parity-diff.json) is diagnostic, not a similarity target: ground, lighting, captions and material rendering differ by design between the neutral oracle and production world.

Full-sheet distance is 0.60934 for human and 0.69286 for mounted; edge-energy ratios are 1.07607 and 1.64173. The dominant full-frame difference is the production ground/environment, not displaced geometry. Visual comparison at the supplied crops, rather than the global distance, establishes the silhouette correspondence.

The fresh reviewer inspected all four full sheets and ten crops. Remaining visible issues are explicitly not accepted as finished art:

- Production side-view highlights clip/bloom, obscuring some attachment boundaries. The source's neutral shading does not. Material response is owned by 04.
- The shield checker is absent in production and some limbs acquire team-color accents. The scalar-only material path is not the source-texture implementation; 04 must restore faithful material assignment.
- Production shadows show fine stipple/grid texture. This is also present in the existing production workbench and remains a production-shadow issue for 15/16/29, not a reason to replace production lighting in the harness.
- Human waist/leg gaps are visible in both images: these are deliberately separated diagnostic components, not newly authored soldier anatomy.
- Thin overlapping limbs are less distinct under the current production highlights. Complete silhouettes are framed, but these static samples do not prove motion continuity or contact throughout a gait.

## Verification

The [final scene report](final-checks.json) records `battle-model-workbench` and `blender-production-candidates` passing on bundled headless Chromium/SwiftShader at `http://localhost:5177`. All seven snapshots compare at explicit zero pixel/color tolerance. Fresh same-pose renders are byte-stable, and both production entry points retain identical submission pixels.

Run from `web/`:

```
VERIFY_GPU=1 VERIFY_URL=http://localhost:5177 node scene.mjs battle-model-workbench blender-production-candidates
```

The candidate producer is `packages/soldier-assets/bake/blender-candidates.mjs`; the source appearance test exercises the real GLB baker and bundle loader. Its current run reports human maximum error 4.31095e-7 m across four samples and mounted maximum error 3.91656e-7 m across ten samples, plus successful malformed-GLB rejection, Uint32 merge, CLI and determinism checks. Typecheck passes with the integrating raw-renderer and bundle dependencies.

One combined diagnostic run was interrupted when verification assets were copied into the live Vite public directory, causing a full-page reload. The final run was performed after dependencies settled and passed without page errors; no timeout or rendering tolerance was relaxed.

Independent code review found source seconds being treated as normalized phase; phase now derives from clip duration. It also identified the obsolete scene selector in `web/package.json`; the integrating owner replaces it with the production workbench, source oracle and candidate scene. Manual shape/diff/docs review found no remaining local compatibility path. The old imported-joint-box preview and kit-validation UI are removed rather than preserved beside the new loader.

The separate fresh UI review reported inherited right-edge navigation overflow, the status line outside the inner panel border, small text and an apparent sidebar imbalance. Full-image inspection confirms the model is centered within the canvas; the sidebar occupies its own area. The new source-error guidance is fully readable without internal panel clipping or overlap. The control crop was extended through the entire outer status line and lower margin so the evidence does not itself suggest clipped UI. Navigation redesign and inherited typography/status placement are not part of this candidate-loader change.

## Changed-test ledger

The complete [fresh UI findings and dispositions](controls-critique.md) are retained separately from this test ledger.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `asset-workbench` flow | Rendered fabricated boxes for a two-bone import beside a placeholder; malformed GLB produced an error while placeholder remained. | Retired preview-only scene. Actual source baker tests reject malformed GLB; candidate scene renders the exported weighted geometry; workbench reload tests retain last-good production pixels. | The old visual did not represent imported mesh surfaces and was not a production consumer. **moved** |
| `renderer-lab-routes`, assets entries | Exercised paste/file/drop controls for the old kit JSON validator. | Retired with that UI; actual bundle loader tests validate required content and browser reload tests exercise malformed catalog, missing appearance/clip and invalid animation data. | The current contract is a complete baked appearance, not optional kit overrides. **moved** |
| `battle-model-workbench`, snapshot gates | Inherited shared snapshot defaults of color threshold 0.12 and allowed mismatch ratio 0.02. | Explicit threshold 0 and mismatch ratio 0 for all owned snapshots. | A changed control panel otherwise passed with 7,331 differing pixels. Deterministic fixtures should catch any change. **moved** |
| `battle-model-workbench`, controls | Old navigation contained retired asset routes and no source-bake error guidance. | Updated baseline removes those links and adds readable offline-bake guidance; model framing and pose are unchanged. | Intentional UI owner cleanup; [before](controls-before.png) and [current](controls-current.png) are retained. **moved** |
| `battle-model-workbench`, animation reload rejection | Covered missing clip lists and partial allocation faults. | Also rejects an otherwise valid animation whose matrix array is one element short; last-good pixels remain unchanged. | A truncated matrix payload must fail before GPU installation. **moved** |
| `blender-production-candidates` | No complete local-GLB candidate production scene. | Two fixture sheets, twelve direct-clip poses in two views, repeated-render stability, custom-catalog initialization/reload and invalid-catalog retention. | Replaces skeleton-box preview with the real source-to-production path. **moved** |

No simulation or unit-stat changes are part of this pass.

## Human checkpoint

Preview opened at 2026-09-06 02:36:21 UTC with production human, source human and updated controls, and closed at approximately 02:41 UTC after the nonblocking review window. No user feedback arrived. Proceeding is based on the static deformation, reload and UI evidence, not inferred user approval; detailed art and material issues above remain open.
