# Slice 10 — Integrate: campaign strategic sea (subtle / chart-respecting)

The aesthetic-tension slice. Campaign is a raster-painted chart viewed at high pitch; literal
choppy ocean fights the cartographic look. The deep-ocean reference is **explicitly not** the
target here.

## Contract unlocked
The campaign sea gains *subtle* animated glint + foam + a shared depth ramp from the water
material, while still reading as a **painted strategic chart at altitude, not a diorama** —
and without breaking label/marker/sea-lane legibility.

## API seam — and the decision this slice owns
The campaign map is a **single `world-depth-fill` map-surface mesh** (`mapPass.ts`,
`campaign/renderer.ts:181`, `depth:'write'`), sea derived from the `seaAmount()` raster mask.
Pick a direction (confirm in Slice 1 known-unknown #6):
- **(a) Inject** `waterShade` into the sea branch of `naturalCampaignColor`/`fs`
  (`mapPass.ts:219-227, 250-255`) keyed by `seaAmount()`/biome alpha, at a **low mix** governed
  by a `seaAnimateMix` knob (mirror the existing `__SEA_TINT_MIX__`/`__TERRAIN_MIX__`
  injection), **zoom/pitch-gated** (campaign pitch ramps 0.32→0.82): near today's painted look
  far out, more motion close in. Displacement near-zero or off.
- **(b) Revive** the dormant `CampaignWaterPass` (`atmospherePass.ts`) as a sea-overlay pass.

**Decide revive-vs-delete on `CampaignWaterPass`/`campaignWaterFeatures` here.** Recommended:
**delete** — the shared material supersedes it; production never used it.

Migrate the campaign sea color (`terrain.ts:13` `sea [38,60,84]`) + depth-grade endpoints
(`mapPass.ts:222`) into `waterPalette`. **Fallback** if it reads wrong: keep `mapPass`'s
current grade and apply only glint + foam from the shared material — strictly additive.
Owner: game-renderer/campaign.

## What the human can run / see
`/renderer/campaign-map` at near + far zoom; `web/scenes/campaign/water-sea.mjs`.

## Verification gates
- `snapCheck` at near + far zoom (re-bless campaign sea shots; change-ledger).
- **Legibility gate:** labels / sea-lanes / markers / fog-of-war still legible over the
  animated sea.
- Perf at full-map zoom (whole-sea coverage is the worst-case fill cost; campaign is
  sampleCount 1).
- `compare-screenshots` for foam/glint **behavior only** against a *subtle* target — campaign
  deliberately diverges from the deep-ocean reference.
- **Last check:** `screenshot-critique` — "still reads as a strategic chart, not a battle
  ocean?"

## Slice variable & crop
**Variable:** campaign sea subtlety + zoom-gated animation. **Crop:** a sea region with a
coastline, a sea-lane, and a coastal label, at two zooms. **Out of scope:** land, roads,
territory/borders, the battle surfaces; making campaign look like the battle open sea.

## What must stay green
All campaign land/label/road/marker/territory snapshots; coastline foam (`mapPass.ts:247-249`);
roads/cities/labels seated by `civsimCampaignWorldDepth3d` must not z-fight the sea; the
`renderGraph.ts` campaign water bucket; the `waterLayer` stat update.

## Human review checkpoint (NON-BLOCKING)
`preview-shots` the chart at two zooms; ~5 min; decide and record if silent.

## Feedback that would change this slice
"Map looks like an ocean now" → cut `seaAnimateMix`, gate harder by zoom, drop displacement to
zero. "Lost the antique-chart feel" → fall back to additive glint+foam over the painted grade.
