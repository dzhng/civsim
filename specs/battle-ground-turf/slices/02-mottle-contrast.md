# 02 — camo attribution, then mottle contrast down

**Visual variable:** mid-frequency tonal contrast only. Strand detail (03), edges (04),
blade geometry, hue: frozen / out of scope for judgment.
**Depends on:** 01. Turf sampling does not exist in production yet — this slice is judged
with the old fbm fine layer still in place; ignore that layer when judging.

## Contract unlocked

With one profile owning every amplitude, mid-frequency ground variation is mostly
value/warmth at low amplitude, hue nearly constant — on the playable ground, the vista
meshes, AND both terrain-quad styles (one material family; a contrast seam at the quad
boundary is a failure).

## API seam

New `packages/photoreal-renderer/src/battle/groundDetail.ts` — the single owner of
detail-composition and its constants:

```ts
export const TURF_CONTRAST = {
  driftAmp, mottleAmp, bladeAmp, blade12Amp, detailClamp: [lo, hi],  // today .10/.13/.10/.06/[.68,1.32]
  canopy: { spreadLo, spreadHi, shadowMax, liftMax },                 // farGrass overlay terms
  quad: { speckleStrength, darkFleckStrength, scrubMix, dustStrength /* per style */ },
} as const;
export function groundDetailNode(world: Vec2Node, color: Vec3Node, opts): Vec3Node;
```

`groundDetailNode` is the EXTRACTION of the existing drift/mottle/blade composition out of
`createGroundMesh` (terrainLayer.ts:389–396) — created now so 03 extends this one function
instead of forking the material. `terrainQuadMaterial` keeps its structure but reads every
strength through `TURF_CONTRAST.quad`; the farGrass canopy block reads `TURF_CONTRAST.canopy`
(its colors moved to `MEADOW.farGrass` in 01).

## Work order inside the slice — measure before tuning

1. **Attribution instrumentation:** the scene takes a `?detail=` query that zeroes one term
   at a time (mottle / canopy / quad flecks / scrub). Capture the isolation grid into
   `specs/battle-ground-turf/assets/attribution/`. The farGrass canopy overlay
   (terrainLayer.ts:450–486) is the prime suspect — hue+value swings active from ~5 m,
   covering most playable ground at RTS zoom. Scope the tuning to the guilty terms.
2. **Contrast reduction:** lower the guilty amplitudes; re-express variation as value/warmth
   modulation around the anchor hue (scale channels together, allow slight warm bias, never
   rotate hue); shrink the quad olive-ramp spread and dark-fleck/scrub island terms by the
   same visual amount as the near ground.

## Runnable artifact

`battle-ground-turf.mjs` gains the meadow fixture (fixed genmap seed containing open meadow,
a mud patch, and the cosmetic road): shots `ground-turf/rts.png` (RTS framing, ground-only
crop), `ground-turf/topdown.png`, `ground-turf/far-band.png` (playable→quad handoff, judged
at BOTH zoom stops — the style flips wide-detail below zoom 1.2).

## Verification

- Telemetry (archive before editing, from the ground-only crop): P90–P10 luminance span,
  mid-frequency bandpass RMS, mean luminance, OKLab mean hue/chroma + spread.
  Acceptance targets: mid-band RMS down 30–50%; mean hue moves ≤ 2°; mean luminance within
  ±3/255; hue/chroma spread narrows or holds. Targets are telemetry, the crop verdict decides.
- **compare-screenshots**: `rts.png`/`topdown.png` against `assets/ref-rts-meadow.png` /
  `assets/ref-topdown-turf.png` (contrast character only) AND against
  `assets/before-photoreal-parity.png` (less-wrong verdict: camo gone, not gone flat).
- **screenshot-critique** (unprimed) on the three shots — last check before blessing.
- Re-bless wave: no-UPDATE_SHOTS sweep → enumerate moved baselines → ground-mask diffs →
  one bless commit with the file list. Carried-red ledger respected. Campaign byte-identical.
- Perf gate trivial (constants only) but run the paired check anyway.
- Non-blocking preview-shots checkpoint (~5 min): the ONE question for David — are the camo
  islands gone while the field still has broad tonal life (not billiard felt)?

## Stays green

Slope rock/scree, churn interior, water/shore, blade gates, terrain seating/elevation,
environments/shadows, campaign, cargo.

## Feedback that changes this slice

- "Still camo" → lower mid-band amplitude or chroma excursion further.
- "Too flat" → restore broad (drift-scale) value movement — never hue islands.
- "Needs visible fibers" → that is 03; record, don't compensate here.
- If attribution shows the quad band's farGrass handoff now over- or under-punches relative
  to the calmed near ground, the canopy retune is IN scope (same variable, different distance).
