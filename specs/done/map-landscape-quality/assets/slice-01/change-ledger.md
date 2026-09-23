# Slice 01 behavior ledger

| Test / snapshot | Previous behavior | New behavior | Why |
|---|---|---|---|
| campaignLandscape triangle seating | Private clamped height closure sampled preview | Presented indexed surface samples actual triangles | One geometry/query owner; same in-domain seating |
| campaignLandscape detailed coast | Full mask owned wet vertices and tree exclusion | Same invariant on world-aligned halo sampling | Tile edges cannot become coasts |
| campaignLandscape overlapping windows (new) | Window-local seeds and boundary derivatives could differ | Heights, normals, coast distances and trees agree | Revisit/adjacent-window continuity |
| renderedSurface diagonals/rays (new) | No common indexed query | Both diagonals and tilted rays hit raised triangles | Terrain-aware picking |
| renderedSurface fallback (new) | No shared detail/coarse query view | Outside detail uses coarse; hidden coarse triangles cannot win | One active surface owner |
| landscape-alps / landscape-italy | Local seed trees, clamped edge normals | World seed trees, halo normals, aligned sample origin | Intended surface-contract change; art remains unfinished |
| landscape-surface (new) | No coastal window fixture | Adjacent windows and presented camera ray | Visible continuity checkpoint |
| Landscape scene comparison options | Inherited tolerant defaults | Explicit zero threshold and zero differing ratio | Spec's exact repeat contract; other gates unchanged |
