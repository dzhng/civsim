# Slice 10 — Campaign strategic sea (subtle / chart-respecting) + delete `CampaignWaterPass`

The third and last production surface. Deliberately **not** the deep-ocean look: the campaign map is
an antique painted chart, so the sea gets only a *subtle*, zoom/pitch-gated shimmer — enough to feel
alive up close, still a chart from altitude. The dormant `CampaignWaterPass` is deleted, not revived.

## Contract unlocked
The campaign sea carries subtle `waterShade` glint + coastal foam behaviour injected into the
existing `mapPass` raster sea, governed by a strength knob and gated by zoom/pitch, without
disturbing labels, sea-lanes, borders, roads, or the painted-chart identity. One dead pass removed.

## API seam (module / functions / data / ownership) — owner: game-renderer/campaign
- **`campaign/mapPass.ts`:** inject `waterShade` glint + foam *behaviour* (NOT the full sea material)
  into the `fs` sea branch (`~:219–227` `naturalCampaignColor` sea grade + `~:240–255` coastal
  overlay), keyed by `seaAmount()`, at a **low `seaAnimateMix`** knob mirroring the existing
  `__SEA_TINT_MIX__` string injection (`~:450`). **Zoom/pitch-gated** (campaign pitch 0.32→0.82:
  painted look far out, subtle motion close in). **Displacement ≈ 0** (the sea is the single
  depth-write map-surface mesh — no z-bearing water). Migrate the sea albedo endpoints
  (`mapPass.ts:222` `mix([0.40,0.56,0.64], [0.16,0.30,0.44])`) into `waterPalette` (the 4th and last
  inline colour site).
- **Delete** `CampaignWaterPass` / `WATER_WGSL` / `campaignWaterFeatures` (`campaign/atmospherePass.ts:365–467`)
  and their `apps/renderer-lab/src/router.ts` references — dormant, never wired to production, and a
  second sea authority would fight the mask.
- **Additive-only fallback:** if the `waterShade` sea reads like a battle ocean, keep `mapPass`'s
  current painted grade and apply only the glint + foam additively over it.

## What the human can run / see
`/renderer/campaign-map` at a **near** and a **far** zoom. New scene `web/scenes/campaign/water-sea.mjs`.

## Verification gates
- `snapCheck` at both zooms; **change-ledger** the re-bless.
- **Legibility gate:** italic sea names (`seaLabels()`, `~:1315`), sea-lanes, markers, and edge fog
  stay legible over the animated sea.
- Perf at full-map zoom (worst case: whole-sea fill; campaign sampleCount 1).
- **`compare-screenshots`** for glint/foam *behaviour* vs a **subtle** target (campaign deliberately
  diverges from `assets/reference-ifft-ocean-dusk.png` — do NOT compare against the deep-ocean ref).
- **Last check (required): run the [`screenshot-critique`](../../../.claude/skills/screenshot-critique)
  skill** on both zooms: "still a strategic painted chart, not a battle ocean?"

## Slice variable & crop
**Variable:** subtle sea animation strength + the zoom/pitch gate. **Crop:** a sea region with
coastline + sea-lane + coastal label, at two zooms. **Frozen inputs:** `WATER_SHADE_WGSL`,
`waterPalette` glint/foam constants, `cam.time`.

**Out of scope:** the deep-ocean look; battle surfaces; land/label/road typography (protect it).

## What must stay green
All campaign land / label / road / marker / territory snapshots; coastline foam (`mapPass.ts:247–249`);
`civsimCampaignWorldDepth3d` seating of roads/cities; the campaign water render bucket; the
`waterLayer` stat; the two-color rule (faction vs allegiance) — the sea shimmer introduces no third
colour vocabulary.

## Human review checkpoint (NON-BLOCKING)
[`preview-shots`](../../../.claude/skills/preview-shots) near vs far side by side; ~5 min; decide on
the evidence and record if silent, close the shots.

## Feedback that would change this slice
"Reads like a battle ocean / too busy" → lower `seaAnimateMix`, tighten the zoom gate, or fall back
to additive glint+foam over the painted grade. "Sea names/lanes hard to read" → the sea shimmer is
over-bright; dim it under labels. "Dead at all zooms" → the gate is too aggressive; open the near band.
