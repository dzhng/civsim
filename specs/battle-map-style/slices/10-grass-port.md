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

## Feedback that would change it

Blade height/density taste at the close camera — parameters. Anything
structural escalates to David with the ledger open.
