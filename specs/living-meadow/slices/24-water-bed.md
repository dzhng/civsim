# 24 — Water bed  ●── JOIN: seaLayer surfaces ──●

**Track:** audio · **Gate:** Offline RMS-rises-with-proximity + pan-sign + by-ear ·
**Depends:** `20`. **Risk R7.**

## Contract
Water ambience — a burbling/lapping bed that swells and pans as the camera nears a
water surface.

## API seam
`packages/ambient-audio/src/beds/WaterBed.ts` — **`WaterBed`**: pink noise → 6-band
resonant burble bank → lowpass (opens with proximity) → highshelf → gain → **stereo
panner** → mixer. `waterProximity`/`waterPan` come from the director, computed from
the camera to the nearest **`lakeSurfaces` / `oceanPlanes`** (the battle world holds
`lakePlanes`/`oceanPlanes`; `scene.ts:428` `generatedMap.lakeSurfaces`) — the join
with the existing `seaLayer`.

**R7:** battle has **no rivers**, only lakes/ocean. If a map has no water surface,
this voice scopes out (silent) — it does not invent a source.

## Verification
Offline probe: RMS rises as the proximity input rises; pan sign correct for
left/right. By-ear walking the harness listener toward water.

## Delegated
Which surfaces count (lakes only vs ocean edge too); the proximity/pan curve;
whether landlocked maps omit the voice entirely.
