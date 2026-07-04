# 14 — Vista backdrop: the render-only world beyond the playable rect

**Decided (David, 2026-07-04): the rendered 3D world is 2× the playable map**
— a generator-emitted, render-only vista ring around the playable rect,
replacing the legacy horizon-blocker quads for generated maps. Units are
confined by the invisible wall at the playable boundary; the E/W edges carry
real in-grid terrain seals (slice 05), and the vista continues them outward.

This matches shipped practice: Total War battle tiles render out to ~8 km
around a ~2 km playable square, with the vista authored as a deliberately
low-frequency heightmap around the high-frequency playable area. 2× is our
committed floor, not a ceiling — see "optional outer ring" below.

## Contract unlocked

The horizon silhouette reads as the reference family from the locked camera;
generated maps stop depending on `buildBattleHorizonLayout`'s blocker quads.

## API seam

- **One height function, two sample rates.** The slice-02 generator's noise
  domain is defined over the FULL vista extent (playable rect × 2 per axis,
  centered). The playable `Terrain` samples the center at 4 m cells; the vista
  samples the surround at **16 m cells** (4:1 — the safe single LOD jump).
  `genmap` emits the vista as a coarse render-only grid (`VistaGrid`: heights
  only, no speed/tint gameplay semantics); wasm exposes ptr/dims; the sim
  never reads it. It rides the descriptor, not the golden hash.
- **Band-limit the vista** to avoid coarse-sampling aliasing: fBm octaves with
  wavelength < ~32 m fade out of the vista field over the first ~10 coarse
  cells outward from the playable edge; over the same band the vista heights
  blend from fine-sampled boundary values to the band-limited field.
- **Crack-free seam, no skirts:** vista boundary vertices sit at exactly every
  4th fine boundary vertex with identical sampled heights; the 3 intermediate
  fine boundary vertices are constrained to interpolate linearly along the
  coarse edge. The height error lives on the outermost fine row — behind the
  invisible wall, where nothing plays.
- **Normals from a shared source:** both meshes sample one fine-resolution
  normal texture (with mips) derived from the height function. A lighting
  seam at grazing RTS sun is more visible than any geometric crack.
- **Edge-feature continuity:** the slice-05 seal features continue as explicit
  vista terms, not emergent noise — the E/W ridge masses straddle the playable
  boundary (their feet inside the grid, their bulk in the vista), the ocean
  `WaterReach` keeps its water plane running out, forest belts keep their
  treeline. The invisible wall must sit 10–30 m *inside* the visual base of
  the blocker, so a unit stopped at the wall looks stopped by the cliff, not
  by air.
- **N/S stays open:** low plains, gently sinking a few meters below the
  playable plane far out so the vista's outer edge drops below the haze band
  at the lowest camera pitch. No backdrop geometry may wall the N/S arrival
  horizons (scene stat guards this).
- **Render hygiene:** vista mesh uses the slice-13 material family (coarse
  variant), `castShadow = false`, `receiveShadow = false`, CSM/shadow bounds
  stay fit to the playable rect, vista excluded from picking/raycast layers.
  One draw call; ~90k triangles at 16 m cells — budget non-issue.
- **Far fog ring (committed — TW is the model):** beyond the 2× vista, a
  second ultra-coarse ring (64 m cells, out to ~3–4× the playable extent)
  provides the fog runway, so N/S haze can saturate naturally instead of
  slamming to full opacity at ~800 m. Silhouette-and-fog duty only: heavily
  band-limited, E/W it carries the receding ridge rows the reference layers
  into haze, N/S it is sinking plain. Fog reaches full opacity inside this
  ring, always before its outer edge (slice 16 owns the fog values; this
  slice owns the geometry being there to catch them). A few tens of
  thousands of triangles — still one draw call per ring.
- Legacy `buildBattleHorizonLayout` blockers survive for the three hand maps
  only, and die with them in slice 20.

## Human can run

The vista route: horizon band with vista on/off toggle; a low-pitch 360°
camera orbit from the playable center (the diorama-edge check).

## Verification

- Judged crop: the `sky-haze`/upper `flank-cliff` silhouette band from slice
  00 — silhouette, layering, and scale only. compare-screenshots vs the
  reference; screenshot-critique unprimed last.
- Seam checks: a boundary-strip crop under grazing light (no lighting line,
  no cracks); a scene stat asserting vista boundary vertex heights equal
  fine-sampled heights.
- N/S openness stat (no vista pixels above the horizon line in the arrival
  sightlines); elevation tripwire; `perf:30k` green.
- **Out of scope wrongness:** rock texture detail (13), haze depth (16),
  grass, water.

## Stays green

All prior verdicts; hand-map look untouched; shadow quality on the playable
field unchanged (CSM bounds must not grow).

## Feedback that would change it

Backdrop presence (ridge amplitude, vista extent multiplier) — recipe
parameters. Wanting TW-scale distance (4×+) is the outer-ring extension, not
a rearchitecture.
