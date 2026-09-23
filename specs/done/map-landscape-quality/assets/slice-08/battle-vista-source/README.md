# Battle vista shoreline diagnosis

The repeated staircase in the [composed coast](../../slice-13/composed/frames/battle-genmap-curated/shore-and-crags-water-join.png) is already present in the generated vista's water samples. The signed-shore correction removes that staircase at the composed camera. The green-lip finding remains open.

The probe reads seed 1 through the existing wasm getters, before any GPU material, camera, shadow or inter-band seam. The unchanged wasm is copied from the composed battle audit checkout. Run `node specs/done/map-landscape-quality/assets/slice-08/battle-vista-source/probe.mjs . /tmp/water-source.json` from a checkout containing the built wasm. [Source samples](source.json) include the live descriptor, original heights, exact water values and upper wet row per offshore column.

| Band | Cell size | Offshore columns | Constant-row segments | Row jumps |
|---|---:|---:|---:|---:|
| Near vista | 16 m | 76 | 57 | 18 |
| Far vista | 64 m | 48 | 35 | 12 |

For example, near-vista columns at x=1200,1216,1232,1248 all end at wet y=496; x=1264 jumps to y=512. The pattern repeats at four-column intervals. This extends within each band, so a crack at the playable/vista join cannot explain the repeated shape.

## Boundary ownership

The canonical Rust `WaterReach` computes a continuous coast distance from the same source used by playable terrain. Its offshore bay widens by one quarter of offshore distance. `generate_vista_band` discards that subcell distance and stores binary wet/dry values. The physical renderer then interpolates those values over the coarse triangles. The shader's smooth transition softens each step but cannot recover the discarded diagonal boundary. Ground-cover color occupies the transition beside the water; its contribution to the visible green lip still needs a material-only browser control.

Generated vistas use water shading on their terrain mesh. They do not create the separate ocean plane used by authored battle edges. Changing that ocean plane would not reach this defect. Replacing the seam strip or increasing haze would also leave the measured source quantization intact.

## Smallest next correction

Preserve the continuous shore signal from the existing coast owner for render-only vista consumption. Keep physical height, water tint, speed/passability, recipes and terrain hashes unchanged. Use one existing render channel with an honest signed-distance contract, or a deliberately reviewed equivalent; do not duplicate the coast formula in JavaScript or hide material thresholds inside the generator. The shared water response should consume the signal after interpolation. A renderer-only smoothing heuristic over binary samples would infer geography that the source already knows exactly.

This is a narrow source-to-presentation contract correction. It needs an explicit decision about the existing render-only `water` float channel: renaming/reinterpreting it is not a gameplay schema change, but it is a consumer contract change and should not be concealed as a shader tweak. The implementation decision is to rename the existing float payload to `shoreDistance` across Rust, wasm and TypeScript. It carries signed world metres, positive on the wet side, from the canonical coast owner. This adds no buffer or persisted gameplay schema. The first candidate freezes vista heights and changes only the signal; a geometry change needs separate evidence.

The follow-up should first pin a continuous diagonal coast through both vista resolutions, compare original physical arrays/hashes, then run the existing seed 1 composition with material and geometry controls. Actual candidate screenshots and fresh critique must decide whether both staircase and lip are resolved. Source recipes, physical arrays and hashes remain protected. Verification below will distinguish source correctness from final visual acceptance.

## Signed-signal CPU checkpoint

The first candidate uses the canonical coast-distance and reach threshold together: the minimum of coast distance and `reach - cell` has the same wet-side sign as the existing physical conjunction. The original physical boolean and height expressions are unchanged. No-coast samples use a finite negative dry sentinel so interpolated GPU attributes remain finite. The renderer's shared water-response owner turns signed metres into an affine signal; saturation remains after vertex interpolation. Both maps retain the same material transition thresholds.

The coastal interpolation test fails with the original binary samples and with a separate binary-control reconstruction of the corrected source. It passes with signed samples. Its tolerance admits the existing row-varying reach taper while rejecting source-cell-sized quantization; it does not demand a perfectly straight invented coastline. All 10 genmap tests pass, including pinned physical hashes and the existing passability seed sweep. TypeScript and the terrain-seam test pass. Release wasm was rebuilt successfully.

A direct old/new wasm comparison over seeds 1, 7, 8 and 455085311 finds byte-exact vista height arrays and identical generated descriptors. [Preservation evidence](source-preservation.json) contains both SHA-256 inventories. Hardware captures and review below verify the bounded correction. The source probe above uses the old getter and should be run against the unchanged composed-audit checkout when reproducing baseline evidence; the candidate deliberately has no compatibility getter.

Formatting and independent read-only Codex review are complete. The reviewer found no actionable issues across the source, getter, adapter and GPU interpolation path; it ran no tests or browser checks. The signed-signal-only capture, material control, fresh critique and strict repeat are complete below. This accepts the staircase correction, not whole coastal appearance.

## Integration contract

The generated wasm binary and JavaScript/type declarations are ignored build outputs. Cherry-picking source alone leaves the application with the old getter. Rebuild wasm from the integrated source before TypeScript/browser validation, or copy the verified candidate wasm package while the source revisions match. The caller and renamed export must deploy together; there is intentionally no compatibility getter.

[Change ledger](change-ledger.md) reconciles the new regression and fixture rename.

## Visual acceptance and remaining material work

The [candidate](visual/candidate.png) changes 2,377 pixels within the 410×210 coast crop relative to the matching composed-audit frame. Its transition is continuous; no heights, camera, physical source or material thresholds changed. The final full coastal frame repeats with zero differing pixels at the strict snapshot gate, with all scene checks passing and no page errors. The initial repeat had 12,652 HUD/card-only differences; that failed report is retained. Final capture readiness waits for fonts and image decoding, but this does not establish the cause of that initial HUD drift.

The [neutral dry-albedo control](visual/control.png) removes the yellow-green fringe without changing geometry, water signal, normals or lighting. This locates the remaining fringe in the dry-ground color response. The control is reverted and is not the delivered material. No new shore tint, all-coast sand skirt, haze or geometry offset was added to conceal it.

Fresh unprimed critique accepts the candidate as meaningfully less wrong with high confidence: the repeated treads/risers disappear, water meets the cliff continuously, and no new obvious artifact appears. It retains the conspicuous painted yellow-green fringe, unusually straight diagonal coast, repetitive central scallops and abrupt rock/grass transition as wider naturalism issues. The diagonal follows the existing source; changing its geographic shape is outside this correction. The material fringe remains a real follow-up, rather than being described as fixed by this pass.

The [source identity](visual/source-identity.json) verifies the exact IPv4 Vite root and matching served/local wasm hashes. Another worktree listened on IPv6 localhost at the same port; it was not the explicit capture URL. The [temporary capture patch](visual/capture-scene.patch) reuses the existing prepared seed-1 framing (apply with `git apply --unidiff-zero`). Canonical scene source was restored and software screenshot baselines were not re-blessed from hardware images. Integration still needs its normal canonical visual gates.
