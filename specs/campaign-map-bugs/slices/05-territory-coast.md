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
