# Slice 4 — Sun-glint streak (open-sea plane)

## Contract unlocked
A specular sun-glint streak runs across the water toward the light, scaled by wave slope —
the reference's signature highlight — and tracks the environment sun direction.

## API seam
- `WaterSample.normal` · sun/half-vector → `waterShade` glint term. Sun direction from the
  clock/sun uniform (Slice 1) and/or `waterEnvironment.sunDir`, reusing the existing battle
  sun convention (`horizonPass.ts:40`, `groundPass.ts:67`) so glint agrees with terrain
  lighting. Glint intensity placeholder now; tint moves into `waterPalette` at Slice 5.
- Owner: `water/waterMaterialWgsl.ts`.

## What the human can run / see
`/renderer/water-bakeoff` with glint on and the sun azimuth swept; `water-glint.mjs` at fixed `t`.

## Verification gates
- `snapCheck` on the glint band.
- `compare-screenshots` vs the reference — **glint streak shape/placement only** (mask foam).
- **Last check:** `screenshot-critique` — "one coherent streak that tracks the sun?"

## Slice variable & crop
**Variable:** glint streak shape + intensity + sun-tracking. **Crop:** the sun-track band.
**Out of scope:** albedo hue, depth ramp, haze, foam tuning.

## What must stay green
Slices 2–3 snaps; glint must follow the sun azimuth, not a fixed screen position.

## Human review checkpoint (NON-BLOCKING)
`preview-shots` the glint crop; ~5 min; decide and record if silent.

## Feedback that would change this slice
"Too blown-out / sequins" → narrow the specular lobe and clamp. "Streak points the wrong
way" → sun-direction wiring bug; fix the uniform, not the shader math.
