# 01 — meadow palette owner (zero-diff refactor)

**Visual variable:** none. The gate IS zero pixel movement.
**Unblocks:** 02 (contrast expressed as value/warmth around one anchor), 03 (bake palette
input), 04 (earth albedo constants). Independent of 00.

## Contract unlocked

Every color in the battle meadow family is written in exactly one module, derived from one
anchor — so a future anchor change moves ground, blades, quads, farGrass, and the turf bake
coherently. Today the family exists in five independent copies (see README recon).

## API seam

New `packages/game-renderer/src/battle/meadowPalette.ts`:

```ts
export type Rgb = readonly [number, number, number];
export const GROUND_COVER_COLOR: Record<BattleGroundCover, Rgb>; // moved verbatim from groundPass.ts:21
export interface MeadowFamily {
  base: Rgb;                                        // = GROUND_COVER_COLOR['green-grass']
  blade: { root; mid; tip; dryTipMix; ringMeadow }; // absorbs BLADE_FIELD_PALETTE + bladeFieldLayer.ts:892
  farGrass: { low; high; shadow; lift };            // absorbs terrainLayer.ts:463–477 literals
  quad: { oliveLow; oliveHigh; dry; stubble; darkFleck; /* per style */ };
  earth: { mud; forestFloor; roadDust };            // for 04; values = today's TINT_COLOR entries
  turfBake: TurfBakePalette;                        // for 03
}
export function meadowFamily(base: Rgb): MeadowFamily; // explicit per-channel factors on base
```

- Factors are chosen so `meadowFamily(base)` reproduces every current literal EXACTLY
  (e.g. blade root `[0.46,0.52,0.25]` = base × `[1.150,1.061,0.962]`). Where a clean factor
  can't hit a legacy value, the legacy literal wins, pinned inside this module — pixels are
  the invariant of this slice, ratios are the mechanism.
- Consumers migrate: `groundPass.ts` imports GROUND_COVER_COLOR (WGSL body untouched);
  `buildVistaGroundMesh`'s inline duplicate (terrainLayer.ts:649) deleted;
  `BLADE_FIELD_PALETTE` becomes a re-export of `MEADOW.blade` (provenance string updated);
  quad style tables read `MEADOW.quad`.
- Amplitudes/strengths do NOT move here — they are contrast constants and belong to 02's
  owner (`groundDetail.ts`). Colors here, amplitudes there, no third home.
- No photoreal/three.js import enters game-renderer.

## Runnable artifact

Nothing changes on screen — that's the point. Optional: a palette contact-sheet case in
`battle-ground-turf.mjs` (ground swatch · blade root/mid/tip · ring fade · quad swatches)
for future hue-continuity review; if added, it is a NEW baseline, not a moved one.

## Verification

- Unit test pins every derived value to its pre-move literal (ε 1e-6), plus a mutation
  test: changing `base` moves every derived role (a fake derivation of independent finals
  fails it).
- Full screenshot suite **byte-identical, zero re-blesses** — the strongest gate the repo has.
- Capture the carried-red ledger: run the full scene sweep BEFORE the change, record every
  already-red scene in `specs/battle-ground-turf/notes/red-at-start.md`. All later slices
  bless against this ledger.
- Blade record hash/count/tiers/widths unchanged (palette VALUES only moved homes).
- Campaign byte-identical; cargo untouched.

## Stays green

Everything.

## Feedback that changes this slice

If any baseline moves even one pixel, a "derivation" was actually a value change — revert
that entry to a pinned literal inside meadowPalette and record it; do not chase pixels.
