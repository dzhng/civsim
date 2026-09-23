# Shared shader vocabulary

Both map renderers and their scenery/standards now import one neutral shader-math and frame-uniform owner. The previous battle-owned module is removed, with no compatibility export. Function bodies, uniform layout, noise, albedo conversion and normal transforms are unchanged; each world still writes its own frame values.

All 461 tests and TypeScript pass. Independent Codex review found no actionable regression. Campaign composition (including DPR2) and terrain-water captures remain pixel-identical, with input/depth and water-color checks intact.

The production battle edge-ruler checks preserve their single earth-edge texture and 1–2m edge widths. Its historical snapshot is red by 79,228 pixels. A same-browser, same-source parent control at 33cc3278 produces exactly the same candidate image (zero changed RGBA pixels), proving this extraction does not cause that inherited baseline difference. No baseline is refreshed or tolerance weakened. The retained edge-ruler capture is the candidate/control image.

The only touched test is battleTerrainSeam: its import changes to the canonical owner; its assertions and observed behavior do not change. No new tests, resource types, dependencies, layers or rendering modes are added. The shader source moved; comment cleanup removes battle-only ownership claims that were no longer true.
