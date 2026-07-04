# 10 — False Earth grass port: close-gate ratification

Transplant the salvaged blade primitive into this repo's photoreal substrate
and ratify blade anatomy at the close camera.

## Contract unlocked

The one permitted grass architecture exists in our codebase, driven by our
data contract, in our palette — ready for battle integration (slice 11).

## API seam

- Source: `git show pr-3-review:apps/renderer-lab/src/falseEarthCloseGrass.ts`
  — take **only the source-storage core** (~600 of 2301 lines): packed 4×vec4
  / 64-byte blade records in `instancedArray` storage; camera-position
  snapping (stable placement under camera motion); Voronoi clump blending;
  GPU compute reset/route with atomics into **3 indirect-draw LOD tiers**
  (15/5/2 segments at 0–5/5–20/20–64 m); cubic-Bézier spine with
  view-dependent thickness; `MeshStandardNodeMaterial` root→tip ramp + height
  AO + distance desaturation. Leave behind: the rejected CPU-expanded backend,
  the meadow/top-down block, blade-hierarchy lanes, the stats vocabulary, and
  the router stat shims.
- Destination: a new blade layer module owned by
  `packages/photoreal-renderer/src/battle/` (sibling of `foliageLayer`), fed
  by **CPU records** from the existing data owner —
  `sampleGrassField`/`GrassFieldRecord` in
  `packages/game-renderer/src/battle/grassField.ts` (16 floats ↔ 64 bytes,
  ~1:1). The branch's GPU record generator is a known trap (hash mismatch) —
  do not port it.
- **Palette from the shared battle palette on day one** (green/olive family —
  aesthetics rule 3; the salvage red never renders here). Wind stays static
  this slice.
- Driven from a renderer-lab route for iteration speed; production battle
  untouched until slice 11.

## Human can run

The lab route: a dense grass field on a real `BattleTerrainGrid` fixture, at
the slice-00 **close gate** camera (≈12 px/blade).

## Verification

- Judged crop: the close gate through the slice-00 legibility oracle — blade
  silhouettes, clump rhythm, vertical-run p90, tall-column ratio. Positive
  anchor (this crop) and negative anchors (grass-off, a stipple control) run
  together.
- Placement stability: two snaps with a small camera translation — records
  must not swim (camera-snap telemetry).
- screenshot-critique unprimed as the last check; compare-screenshots against
  the reference's near-grass crop for a less-wrong verdict.
- **Out of scope wrongness:** vista integration, wind motion, perf at 30k,
  terrain shape, mood.

## Stays green

Production rendering untouched. Typecheck/lint on the new module.

## Firewall — the ledger's law

If the close gate fails, the fix is parameters, records, budgets, or palette
*inside this architecture* — or a reslice memo. The ~25 rejected families in
`specs/done/battle-map-reference/README.md` are banned re-entries. No new
grass architecture, period.

## Landed (2026-07-05) — accepted at the close gate

- `packages/photoreal-renderer/src/battle/bladeFieldLayer.ts`: the True False
  Earth consumption pattern — ONE shared packed-record storage buffer, per-tier
  visibleIndices + indirect draw buffers, vertex stage fetches
  `visibleIndices.element(instanceIndex)` → shared storage, GPU compute
  reset/route by LIVE camera distance (baked record lod ignored), 3 indirect
  draw calls. Geometry `instanceCount` is set to record CAPACITY — three skips
  zero-instance geometry before consulting the indirect buffer.
- Route `/renderer/blade-field` (renderer-lab); scene
  `battle-map-style-grass-close.mjs` — close-gate crop passes the legibility
  oracle live; grass-off control fails; camera-snap stability green; all
  deterministic across runs. Accepted sampling profile baked as route
  defaults: width 0.13, height 1.25, density 0.8, 40k records, heightJitter
  0.5, bend 0.45/0.35.
- Shading decisions: MeshStandardNodeMaterial (environment = mood owner must
  light the canopy; Lambert never samples the sky IBL here) + the GoT
  field-normal trick (shade normal ≈ terrain normal, mix 0.94) which closes
  the white grazing-sheen hazard; clump-scale height AND width swing from the
  Voronoi clumpWeight; clump shade (0.42–1.18) gives bright-mass/dark-gap
  canopy structure; sharp tip taper after unprimed critique (fat wedges read
  as agave).

### TSL hazards recorded (cost a full day — do not rediscover)

1. **Storage reads only bind in the position graph.** Varyings consumed by
   colorNode MUST be `.assign()`ed inside the `Fn` that IS `positionNode`
   (the salvage pattern). Reading storage from the color path — directly, via
   shared nodes, or a fresh element() chain — renders garbage.
2. **Garbage-huge struct reads must be clamped at the READ** (`clamp(d2.y,0,1)`)
   — unclamped, they blow the albedo which then clamps to exactly 1.0:
   bit-identical WHITE frames that make unrelated edits look like no-ops.
3. **`sin(seed * 43758.5453)` NaNs on Metal** for large arguments; blade-level
   hashes must be small-argument (`fract(seed * 7.13)`).

### Debts routed forward (unprimed critique, 2026-07-05)

- Hard 64 m coverage cutoff line → slice 12 (stochastic distance thinning;
  haze eats the seam).
- Wind motion → slice 11 (owned time uniform).
- Ground under grass reads felt-flat when exposed → slice 13's terrain
  material response (grass-colored detail beyond the blade ring).

## Feedback that would change it

Blade height/density taste at the close camera — parameters. Anything
structural escalates to David with the ledger open.
