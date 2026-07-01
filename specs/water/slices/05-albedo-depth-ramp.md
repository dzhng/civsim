# Slice 5 — Water albedo + depth ramp × environment preset (introduces `waterPalette`)

The slice where color enters — and where the central palette module is born. Geometry, foam,
and glint are frozen from Slices 2–4; only color changes.

## Contract unlocked
Water color is a **neutral albedo × environment preset**, grading pale turquoise shallows →
deeper blue with depth. The **same material** reads warm at golden hour AND as a pale cool
sliver under overcast. The reference's dusk mood comes from the *preset*, never the albedo —
honoring "don't bake light into albedo" and "not a dark diorama."

## API seam
- `water/waterPalette.ts` — the single source for shallow/deep albedo, depth-ramp endpoints,
  foam tint, glint tint. The 4 inline sites collapse to import from it (`horizonPass.ts:22-23`,
  `terrainPass.ts` kind-0, `groundPass.ts:23`, `mapPass.ts:222`) — though those production
  passes are only *rewired* at their integration slices (S8–S10); this slice proves the
  palette on the lab plane under ≥2 presets.
- `water/waterEnvironment.ts` — `{ sunDir, keyColor, fillColor, hazeColor, exposure }`
  presets: golden / dusk / overcast. `waterShade` multiplies neutral albedo × preset.
- Depth input: open-sea uses distance; coastal/campaign reuse their existing depth signals
  later. Owner: game-renderer/water.

## What the human can run / see
`/renderer/water-bakeoff?preset=golden|dusk|overcast&t=<fixed>`.

## Verification gates
- `snapCheck` per preset (`albedo-golden`, `albedo-dusk`, `albedo-overcast`).
- **Two-light neutrality proof:** assert the same material reads warm under golden and pale
  cool under overcast (a hue/luma delta check between presets) — i.e. no mood baked in.
- `compare-screenshots` dusk-preset frame vs the reference — color now in scope, but judge the
  **behavior** (depth darkening + horizon desaturation), not the exact dusk values.
- **Last check:** `screenshot-critique` on both presets, asking the aesthetics "warm key /
  cool fill / not a dark diorama" question explicitly.

## Slice variable & crop
**Variable:** albedo + shallow→deep ramp. **Crop:** near-to-far water gradient.
**Out of scope:** wave shape (frozen), foam/glint tuning, horizon haze (Slice 6), the real
surfaces. **Do not** match the reference's dark dusk *mood* — match its geometry; color
tracks civsim's preset.

## What must stay green
Slices 2–4 at the same `t`; the four current production water sites still untouched on screen
(palette module exists but is not yet wired into them).

## Human review checkpoint (NON-BLOCKING)
`preview-shots` golden vs overcast side by side; ~5 min; decide and record if silent.

## Feedback that would change this slice
"Overcast still looks warm" → mood leaked into albedo; pull the warmth into the preset.
"Shallows too green / too Caribbean" → shift the shallow endpoint toward Aegean turquoise.
