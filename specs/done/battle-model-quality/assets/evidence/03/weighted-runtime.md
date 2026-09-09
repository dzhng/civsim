# Weighted runtime checkpoint

This is partial03 evidence, not completion of the bundle/import cutover or acceptance of detailed art.

The shared runtime mesh retains four joint indices/weights, normals, tangent/UV, color and material/faction channels. CPU far-view posing and both GPU substrates use weighted skinning. Raw campaign also rotates normals with facing/corpse roll and resolves per-appearance clip tables independently of flattened LOD resources.

## Verification

- `bun run --cwd web typecheck` passes after the integrated runtime changes.
- Focused skin, packing, GPU-buffer and public clip-lookup tests pass. Removing the fourth CPU influence changes the expected position from `[1.25, 0.25, 0]` to `[0, 0.25, 0]` and fails the test.
- `VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node scene.mjs battle-model-workbench per-class-vat` passes with no page errors. Every existing workbench snapshot is unchanged at zero pixels. This proves preservation of placeholder appearance, not proof of weighted authored surfaces.
- [Hardware report](perf-weighted-plumbing.json): 30,560 soldiers, Apple Metal-3, GPU medians13.02/11.18ms, pan rAF p9519.34ms, zoom29.78ms, wheel19.76ms, close18.85/19.06ms. All existing33ms gates pass. This paused-simulation benchmark is not live-animation budget07.

Initial separate attribute uploads exceeded baseline WebGPU's eight-buffer limit (nine buffers requested). Packing canonical attributes into one shared vertex buffer corrected the actual pipeline failure without raising device requirements. The failed browser process was explicitly terminated after GPU failure; the corrected run was fresh and passed.

Independent review identified a real16-bit narrowing in the retained class-mesh loader. A loader-level test observed `[65535, 0, 1]` before correction and `[65535, 65536, 65537]` afterward. The old loader still must be removed by complete-bundle03b; correcting it now does not count as that cutover.

## Test behavior ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `class clip lookup follows appearances, not their flattened LOD resources` | With two appearances and three tiers each, appearance1 returned appearance0's start0. | Appearance1 returns its own start5; appearance0 retains0. | Lookup now uses the appearance/tier owner rather than a flattened resource index. **carried-in**, confirmed by red/green mutation of the old lookup. |
| `loaded mesh indices retain vertices above 65535` | Loaded65536/65537 wrapped to0/1. | Values remain65536/65537. | Index width is selected before constructing the typed array. **carried-in**, observed red before correction. |

Other tests added coverage without changing existing expectations. No simulation code, balance inputs, golden hashes or snapshot baselines changed. Authored-fixture production/shadow comparison and final unprimed critique remain required before03 acceptance.
