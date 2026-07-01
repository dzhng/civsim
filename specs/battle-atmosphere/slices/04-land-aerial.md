# Slice 4 — Land aerial perspective (golden)

Rule 1 on land: far ground desaturates into the shared haze while near ground stays warm
and saturated, so terrain recedes into the same horizon as the sky and sea.

## Contract unlocked
The rolling ground gets distance-keyed aerial perspective from the shared helper: far
grass/scrub reads warm-grey and low-contrast, near stays saturated. The land now recedes
into the same horizon colour as sky (S2) and sea (S3).

## API seam (module / functions / data / ownership) — owner: game-renderer/battle
- **New `battle/aerialPerspectiveWgsl.ts`:** `AERIAL_PERSPECTIVE_WGSL` emitting
  `fn battleAerial(col: vec3f, worldXY: vec2f) -> vec3f`, keyed on distance from the camera
  — recommended **camera-space depth** `cameraSpace(worldXY).y` (haze grows *into* the frame,
  matching the tilted-ortho recession) over radial `length(worldXY - cam.xy)`; slice-time
  call, pick the one that reads. It mixes toward `BATTLE_HAZE` by the env's `aerialNear/Far`
  ramp. Injected via `battleEnvironmentWgsl(env)`.
- **`battle/groundPass.ts`:** apply `col = battleAerial(col, in.world)` as the **final `fs`
  step**. Vertex stage (mesh z) untouched — seating invariant. Golden `aerialNear/Far` tuned
  subtle (near-field essentially unhazed).

## What the human can run / see
`/renderer/battle-terrain-3d?gate=river-and-crags&view=field` framed with deep field toward
an open edge; `battle-atmosphere`.

## Verification gates
- Re-bless `battle-terrain-3d/*`, `battle-atmosphere/golden` — **change-ledger**.
- Contrast-vs-distance telemetry: far ground rows trend toward `hazeColor`/lower contrast;
  near rows stay saturated.
- **`compare-screenshots`** vs [`../assets/battle-coastal-vista.jpg`](../assets/battle-coastal-vista.jpg)
  on the **far-ground band (upper-mid third)** — far olive going warm-grey, near warm/saturated.
- **Last check (required): `screenshot-critique`** on that crop: "does the field recede into
  haze, or is the far ground still flat-saturated?"
- `battle-terrain-elevation` seating **byte-identical** (proves the z/mesh is untouched —
  fragment colour only). Six `water-*.mjs` byte-identical.

## Slice variable & crop
**Variable:** far-land desaturation / haze falloff. **Crop:** the mid-to-far ground band;
near foreground and sky excluded. **Frozen inputs:** sky (S2), sea (S3), near ground,
the mesh/seating.

**Out of scope:** blocker haze (S5), the ground's warm/cool grade + sun (that relocation is
S6, value-preserving for golden).

## What must stay green
`battle-terrain-elevation` (seating); six `water-*.mjs`; sky + sea from S2/S3.

## Feedback that would change this slice
"Near ground looks hazy/washed" → push `aerialNear` further out; the ramp starts too close.
"Far ground still saturated" → the distance key isn't reaching the far rows; try camera-space
depth vs radial. "Soldiers float/sink" → you touched the mesh z; `battleAerial` is fragment-only.
