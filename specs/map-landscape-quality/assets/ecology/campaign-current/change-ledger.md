# Change ledger

| Test or capture | Previous behavior | New behavior | Why |
|---|---|---|---|
| campaignLandscape coast/overlap tests | Surface builder also generated and checked trees | Surface checks retain coast, geometry and normal invariants; woodland tests own placement | Remove mesh-dependent planting and duplicate ownership |
| terrainWorker output test | Compared mesh, shore and scenery payload | Compares mesh and shore output and transfer behavior | Worker no longer produces unused scenery |
| campaignWoodland tests | No canonical campaign eligibility contract | Cover clearings, rivers/coasts, steep relief, deterministic output, reservations and production seating | Pin real placement behavior |
| landscape-vegetation | No shared-world scenery lifecycle fixture | Checks tile seating, unchanged submissions, fog and capacity growth | Reproduces and prevents destroyed GPU buffer use |
| campaign-landscape / landscape-surface images | Mesh-spacing-dependent broadleaf population | Shared campaign candidate policy, mixed woodland and clearances | Match forest character and remove duplication |
| composition and tile-anchor images except flat | Tiled terrain omitted slope rock response | Shared campaign slope profile exposes rock on steep ground | One material response; old-profile control exactly matches previous baselines |
