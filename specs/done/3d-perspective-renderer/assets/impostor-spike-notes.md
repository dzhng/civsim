# Impostor Spike Notes

Question: can far-tier soldiers render as octahedral-impostor billboards that
read at vista distance at a fraction of full-mesh cost, without touching the
production crowd path?

## Decisions

- Atlas: startup bake from class-0 placeholder soldier mesh, posed once from the
  placeholder VAT (`march`, phase `0.18`). The atlas is 8x8 hemi-octahedral
  directions, default 96 px tiles, configurable with `?tile=64..128`.
- Bake path: deterministic CPU raster into a canvas-backed texture for this
  spike. It records the same data the production version needs
  (albedo + alpha silhouette), but 14b should replace it with a real renderer
  render-target bake if this visual approach survives review.
- Sampling: nearest tile. I chose the cheapest, most failure-revealing path
  first; if small orbit shots pop, 14b can evaluate 3-tile octa blending with a
  known baseline.
- Faction mask: the atlas bakes the neutral blue class-0 accent into RGB. The
  billboard shader derives a blue-dominance mask from sampled RGB and retints
  it to blue/red/neutral per instance. This keeps one atlas shared by factions.
- Instance data: the route builds `CrowdInstance` objects and the layers consume
  the same semantic fields as the crowd path (`x`, `y`, `facing`, `faction`,
  `classId`, `phase`, `clip`, `alive`, `elevation`, `lod`).
- Route: `/renderer/impostor-spike?mode=mesh|impostor|split&count=10000..30000`.
  `mesh` renders static posed class-0 mesh instances, `impostor` renders only
  octahedral billboards, and `split` uses roughly 22% mesh near tier plus 78%
  impostors.

## Findings

- Browser blocked in this sandbox: Vite failed to bind both `::1:5174` and
  `127.0.0.1:5174` with `listen EPERM`, so no browser shots were produced here.
  The scene writes review shots to
  `web/shots-spike/impostor-spike-{mesh,impostor,split}.png` when the browser
  route launches.
- The route publishes mode, count, draw calls, GPU ms, atlas dimensions,
  tile-selection mode, and faction-mask strategy through `__rendererLabStats`.

## Limitations

- Static pose only. There is no impostor animation or per-clip atlas sequence.
- Lighting mismatch is expected: the atlas bake uses a deterministic simple
  raster shade, while mesh mode uses the photoreal environment.
- No 3-tile blending yet. Nearest tile is intentionally the first visual test.
- No production LOD policy integration, hysteresis, or per-instance frustum
  culling. This spike answers only the impostor visual/perf viability question.
- Class-0 only. 14b would need per-class or shared-class-family atlas policy.
