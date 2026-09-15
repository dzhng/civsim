# Change ledger

All six snapshot pins retain exact zero-tolerance comparison. No CPU assertion, physics value, palette or geometry changed. Pixel deltas are measured against the matched e77eb69e baselines in `footprint-run.json`.

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| campaign-landscape / landscape-alps | Uniform narrow-water color and soft lake shelf | Varied lake/rivers; 22,206 pixels changed | Shared multiscale scattering and broken foam. **moved** |
| campaign-landscape / landscape-italy | Smooth offshore fill and soft constant-distance shelf | Textured offshore, irregular shelf and readable regional surf; 344,664 pixels changed | Shared response with screen-footprint surf contrast. **moved** |
| landscape-water / landscape-water-t0 | Soft isolated foam dabs at phase 0 | Broken surf and blue inlet interior; 190,615 pixels changed | Multiscale foam/scattering at fixed phase. **moved** |
| landscape-water / landscape-water-t2 | Soft isolated foam dabs at phase 2 | Broken surf and blue inlet interior; 190,711 pixels changed | Same response at fixed phase. **moved** |
| landscape-water / landscape-water-t4 | Soft isolated foam dabs at phase 4 | Broken surf and blue inlet interior; 190,285 pixels changed | Same response at fixed phase. **moved** |
| landscape-water / landscape-water-t6 | Soft isolated foam dabs at phase 6 | Broken surf and blue inlet interior; 190,688 pixels changed | Same response at fixed phase. **moved** |

The water fixture preserves all 206,090 dry pixels exactly at every phase; phase return remains exact. Terrain-water is unchanged. The prior matched battle and legacy-water evidence remains applicable because this follow-up edits only the campaign-specific response and imports; neither battle response function nor its consumers changed.
