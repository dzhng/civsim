# Retire test-only Three vista adapters

The Three vista-mesh and seam-install wrappers had no runtime callers. Removing
them also removes their private far-fog opacity and roughness branches. Neutral
vista/seam builders still feed current TypeGPU terrain, while live Three ground
fixtures retain their material path. This is owner retirement, not a visual change.

Web/lab typechecks and19 focused tests pass. Independent review finds no live
consumer removed and passes7 selected tests. GPU captures are not attributed to
this test-only retirement.

## Changed checks

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Three join case in battleTerrainCover | Called retired wrapper; required exact half-forest midpoint and no stone | Removed; existing production CPU vista seam test retains mixed forest and no phantom rock/scree checks | Tests follow the current geometry consumer rather than keeping dead adapters alive. **moved** |
| Provisioned rock map in rockDetailFace | Claimed campaign, battle and vista through Three graphs | Tests live campaign and Three ground-fixture graphs | Actual battle material is TypeGPU; the old vista graph was not its evidence. **moved** |
| Borrowed rock detail in battle-renderer/terrainRockDetail | Ground only; any five-entry bound group counted as wiring | Ground/vista/farFog must bind the actual borrowed texture; terrain disposal preserves it and final owners free resources | Preserves meaningful vista coverage at its current consumer and removes a weak count-only assertion. **moved** |

No production shader policy, terrain data, resource lifetime or test tolerance changes.
