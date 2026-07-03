# 05 — B4: territory wash conforms to the drawn coast ★human

**Contract unlocked:** the faction wash meets the sea along the drawn coastline
— no ~8 km texel stair-steps into the water — while inland faction-vs-faction
edges keep their crisp nearest-texel character (they are good; David approved
them). Evidence: `assets/evidence/b4-jagged-west.png`, `b4-jagged-south.png`,
`b4-jagged-blacksea.png`. Fully parallel lane (needs only 00's shared
classifier decision).

## API seam (one territory material; shader-side mask sharing)
- In the territory pass fragment (or the composite point where the map pass
  already classifies sea), **clip/modulate the territory alpha by the
  render-resolution land mask**: hoist the map shader's sea classifier
  (`seaAmount`) into a shared WGSL snippet so mapPass and territoryPass use ONE
  pixel classifier — the shader-side face of the land-truth owner.
- Alternative if fragment clipping aliases at extreme zoom: upres territory
  texels at coast cells only. Carry both options; the critique gate decides.

## Explicit dead-ends (do not walk)
- No bilinear/linear filtering (the pre-crisp blur was the original complaint).
- No overall territory-raster upres.
- No touching the dual faction border strips or the 0.62 wash strength.
- No terrain-palette compensation.

## What the human can see
- Before/after crops at the confirmed stair-step segments (west coast, south
  coast near Tarracina, Black-Sea north coast) + one INLAND border crop proving
  it unchanged.

## ★ Human checkpoint (non-blocking)
This is David's reported marquee visual — open the coast crops; ~5 min; else
proceed on evidence (critique must be asked: "is the inland border still crisp?
is the coast smooth?").

## Verification
- compare-screenshots: coast crops (smoother) AND inland border crop
  (byte-similar); critique last; campaign-lod faction-view scenes; battle green.
- Oracle: covered by the gpu/scenery/cards lane close-out (07) + final sweep.

## Feedback that would change this slice
- Coast transition width/softness taste.

## Ledger (implemented 2026-07-03, lane-territory-coast)

**Approach chosen: fragment clipping by the DRAWN sea, plus a paint-only
seaward ring in the territory raster.** Two findings sharpened the spec's
seam during implementation:

1. Clipping alone can only REMOVE wash — where the 8 km raster's last land
   cell stopped short of the drawn coast, the edge stayed a blocky cell
   boundary. Fix: `Territory.rebuild` paints one seaward ring of water cells
   by copying an adjacent claimed land cell's fill (paint only — `nearest`/
   `owner`/borders/centroids untouched), and the shader clip owns where the
   wash actually ends.
2. At production the visible waterline is NOT `seaAmount(campaign-bg)`: with
   `terrainMix = 1` the map draws `naturalCampaignColor`, whose coast is the
   biome-alpha bilinear contour (probe-verified: drawn headlands exist where
   both `renderLandAt` and the field grid say water). Clipping by the bg
   raster alone left unwashed land slivers and a fringe halo (first critique).
   So the clip mirrors the map pass composite exactly: `sea = mix(seaAmount(bg),
   drawnWaterAmount(biome.a), terrainMix)` — both classifiers live once in
   `CAMPAIGN_SEA_PALETTE_WGSL` (mapPass consumes `drawnWaterAmount` too), and
   `CampaignMapPass` exposes one `drawnCoast` contract `{bg, biome, terrainMix}`
   that `CampaignTerritoryPass` binds. The wash ends exactly where the visibly
   drawn sea begins, on both terrain layers.

**Rejected alternative:** territory-texel upres at coast cells — unnecessary
once the drawn-sea clip landed (the clip is render-resolution by construction);
would have grown a second raster path. Bg-only clipping (the spec's literal
seam) rejected on evidence: mask schism vs the drawn coast (see 2).

**Invariants held:** one territory material; wash 0.62; dual border strips
byte-identical (paint ring never touches `owner`); nearest territory sampler
untouched (the coast textures get their own linear `coastSampler`, matching
campaign-map-sampler); no palette compensation.

**Evidence** (`assets/evidence/`): `b4-before-*` / `b4-after-*` same-view pairs
(west Cosa→Ostia, south Tarracina, Black-Sea/Azov close-up at cam
`1150,1000,1.2`), plus `b4-after-inland-control.png` — the strictly-inland
Aesernia/Bovianum border crop, 0/52,800 px diff before→after (byte-identical).
Unprimed critiques: inland edges crisp (both runs, high confidence); coast
conformance adjudicated by 6x direct inspection (`throwaway` zooms) — the
remaining "band" a critic flagged is the sea's own shallow-shelf shading,
pre-existing in the natural view. Floating trees near Tarracina = B9 (slice
06); Ostia label crowding = B7 (slice 09).

**Baselines re-blessed (coast-wash variable only):**
`campaign-lod-whole-political`, `campaign-lod-whole-fog`,
`campaign-lod-regional-italy-political`, `campaign-lod-border-fog`.
All natural/close/selected/alignment/polish/water snaps 0 px. Double-run
deterministic (0 px). Probe tool deterministic and byte-identical to the
pre-change run. Battle quick tier: only the 5 pre-existing README-listed
failures (overlays, smoke, banner-plant, minimap) — zero new. Web unit tests:
same 7 pre-existing failures with and without the diff.
