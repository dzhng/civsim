# 03 — Terrain biomes: per-biome hue

**Contract unlocked:** each biome reads natural under the slice-02 grade —
grass, sand/beach, forest, rock, snow sit in the muted slightly-sepia Aegean
register (aesthetics: "never introduce vivid map colors").

## API seam (single owner — terrain palette, invariant 2)
- `packages/game-renderer/src/campaign/mapPass.ts` `naturalCampaignColor()`
  (≈186-237): grass (197), sand/beach (204, 212), forest (214), rock (217), snow
  (221), final blend (275). Must consume `grade()`, not re-implement tone.
- **Firewall:** no `grade()` edits (owned by slice 02); no faction fill.

## What the human can see
- `campaign-lod` `whole-natural` + a new `campaign-biomes` scene with regional
  foregrounds each dominated by one biome (italy=grass/forest, africa-coast=sand,
  alps=rock/snow).

## Verification
- **Slice variable / crop:** per-biome *hue relationships*, judged on the biome
  crop that dominates each region. Out of scope: global tone (02), faction fill.
- **compare-screenshots** per region vs `assets/natural-palette-target.png`.
- **screenshot-critique** last on the biome montage.
- **Reslice note:** if one biome fights the others, sub-split (grass+sand are the
  dominant area — isolate first; rock/snow are edge cases). Record the sub-split
  here as later sub-slices, don't widen this one.

## Stay green
- Palette shader only; scene boots (diffs expected, blessed at Foundation checkpoint).

## Feedback that would change this slice
- A specific biome called out (e.g. "grass still neon", "sand too pink").
