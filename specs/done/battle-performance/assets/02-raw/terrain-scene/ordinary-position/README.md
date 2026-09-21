# Ordinary terrain positions: focused correction

Only the terrain-scene constructor arguments change: ground/horizon and vista owners now request ordinary vertex positions. These surfaces do not use a same-view equal-depth prepass. Grass retains its invariant position, and the RawBattleTerrain default and unrelated controls remain untouched. No shader formula, draw count, geometry, simulation or quality setting changes.

The [paired1x probe](../position-probes/README.md) isolates the constraint. The production-path4x confirmation reduces grazing horizon/repeat error from0.105224609375 to0.0009765625 HDR, with no display pixel above one code. Vista max is0.00048828125. The ordinary4x view still has two water pixels above one code at(582,30) and(585,30), max30/24 display codes (HDR peak0.116455078125); initial source-shadow disagreement also remains. Native initial/repeat PNGs are identical. All strict failed reports are retained and no threshold is relaxed.

The confirmation also verifies that grass and terrain share the owned grid/field snapshot and captures height queries before asynchronous readback, so a pending replacement cannot make metadata refer to a different generation. Failed/pending replacement frames remain exact; cancellation rejects; all resources are released without device/browser errors. Raw-control TypeScript and independent code review pass.

Fresh independent [visual review](visual-review/review.md) finds the initial wall-lighting discrepancy clearly visible and no defensible overall winner. Repeat and corrected horizon are visually close, including the water-edge crop; the critic does not claim a meaningful improvement to the shared serrated apron boundary. Abrupt terrain patches, jagged apron shading, angular water cutouts and weak shoreline integration are recorded shared limitations of this exposed fixture. The correction fixes the measured grazing cross-backend divergence, not these underlying visual defects. Complete-scene acceptance, initial presentation and the remaining water pixels stay open; no backend ranking or performance gain is claimed.

| Changed check | Previous | Current | Reason |
| --- | --- | --- | --- |
| `run()` horizon/repeat,1x (terrainScene-check.ts (historical path: `../../../../../../../apps/battle-perf-lab/src/raw/terrainScene-check.ts`)) | Max HDR0.105712890625; above1/255 | Max0.0009765625; within1/255 | Ordinary terrain positions remove the constraint isolated by the paired probe. [moved] |
| `run()` horizon/repeat,4x (same file) | Max HDR0.105224609375; above1/255 | Max0.0009765625; within1/255 | Same scoped correction confirmed with four samples. [moved] |
| `run()` pending-replacement queries (same file) | Collected after asynchronous readback; comparison skipped for pending-old | Captured synchronously with the rendered generation and compared exactly | Metadata must describe the same committed generation as the submitted frame. [moved] |

The overall numerical control remains red because its original initial-presentation and two4x water-pixel failures are retained. No existing CPU test or simulation behavior moved.
