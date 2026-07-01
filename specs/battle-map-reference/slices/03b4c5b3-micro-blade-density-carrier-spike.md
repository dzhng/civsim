# Slice 03B4C5B3 - micro-blade density carrier spike

## Contract

Test whether the texture-backed grass carrier needs many much smaller
field-owned primitives before it can read as dense continuous grass. 03B4C5B2
proved that fewer large overlapping carrier sheets move foreground edge energy,
but they read as straw/wire islands with exposed gaps. This slice owns only the
**carrier primitive density and scale** question.

Freeze:

- 03B3A softened meadow coverage and 03B4B2 root material;
- generated atlas palette/content from the current texture route;
- shader coverage principles from 03B4C5A and carrier alpha learning from
  03B4C5B2;
- selected field records, slope/terrain normal seating, camera, terrain, fog,
  water, sky, crop windows, and reference target;
- broad grass colour, atlas stroke colour, meadow/root strength, camera, terrain,
  cliff shape, water, sky, and distance fog.

Do not tune atlas colour/content, meadow/root material, fog, camera, terrain,
water, sky, or palette in this slice.

## Approach

Build one focused primitive-family/workbench variant beside `texture-volume` and
`texture-carrier`, such as `texture-micro-carrier`, that answers whether fine
coverage needs a high count of small terrain-seated texture primitives.

1. Start from the same `battle-map-reference-primitive-family` route, field
   records, atlas, crop windows, and target crops used by `texture-carrier`.
2. Reduce per-primitive footprint and visible stroke length substantially versus
   `texture-carrier`; do not use large overlapping sheets.
3. Increase submitted carrier records or per-record micro-cards enough to test
   fine density. This slice may exceed the old `83200` triangle warning line only
   as an explicit readability/perf tradeoff, with telemetry that makes the cost
   obvious.
4. Keep bases seated on the terrain normal and tips biased upward. Slope
   filtering must remain visible in stats; no grass on cliffs.
5. Publish telemetry: primitive family, source records, selected field cells,
   carrier records, micro-card count if separate from records, submitted
   triangles, instance bytes, texture bytes, depth band, and active baseline.

The goal is not to make final art. It is to learn whether the architecture needs
many fine GPU-friendly primitives before atlas content and colour are worth
polishing.

## Result (2026-07-01)

Implemented and **visually rejected**.

The focused route now has a first-class `texture-micro-carrier` primitive family
beside `texture-volume` and `texture-carrier`. It keeps the same generated atlas,
field-cell ownership, terrain-normal seating, root/meadow material, camera,
terrain, fog, water, sky, and crop windows. It reduces the mesh to `8` triangles
per record (`4` micro cards), selects `4600` field cells, emits `7000` micro
carrier records, publishes `28000` micro cards, and submits `56000` triangles
with `448000` instance bytes and the same `65536` atlas bytes. This stays below
the old rejected all-card warning line while making the cost explicit.

This did **not** make the crop read as dense grass. Target-crop telemetry under
`assets/03b4-evidence/03b4c5-texture-backed-grass-volume/diff-micro/` reports:

- foreground `edgeEnergyRatio=0.27844`, `parityDistance=0.47629`,
  `avgLuminanceDelta=-21.85549`;
- midground `edgeEnergyRatio=0.37539`, `parityDistance=0.64696`,
  `avgLuminanceDelta=-45.88860`.

Against the field-shell baseline, the micro path barely moves the image:

- foreground `edgeEnergyRatio=0.90834`, `parityDistance=0.02108`;
- midground `edgeEnergyRatio=0.77840`, `parityDistance=0.05422`.

Direct inspection and unprimed `screenshot-critique` agree with the metrics:
the full shot remains a flat green terrain sheet with scattered dark/brown
specks. The primitives no longer make the large straw/wire islands from
03B4C5B2, but they are mostly invisible at the reference camera or alias into
pixel grit. Midground vegetation still collapses into a smooth plane, depth
falloff is abrupt, and the carrier marks read as dirt/noise rather than
continuous grass body.

Useful implementation artifacts to keep:

- `texture-micro-carrier` route/family telemetry in
  `BattleGrassPass`, `renderer-lab-routes`, and
  `battle-map-reference-primitive-family`;
- micro-card telemetry (`grassPrimitiveMicroCards`);
- evidence archive:
  `texture-micro-carrier-full.png`,
  `texture-micro-carrier-stats.json`,
  `texture-micro-carrier-current/`,
  `texture-micro-carrier-target-crop/`,
  `diff-micro/`, and `diff-micro-vs-field-shell/`.

Learning: density/count was not the hidden missing variable. Many small
world-space atlas cards at this camera are either subpixel and lost, or visible
only as grit. The next slice must test the **minimum visible grass-body
representation** before atlas colour/content: a primitive or material/shell path
that makes continuous foreground volume visible at the reference camera without
turning into broad sheets, rows, or screen-door speckle.

## Accept / Reject

Accept only if the foreground crop reads as continuous fine grass body at
full-image scale and in crops, without individual carrier primitives reading as
straw, wire, rows, cards, flecks, debris, or broad sheets. The midground should
move away from the field-shell baseline without a hard cutoff.

Reject or reslice if:

- exposed ground plane still dominates the lower third;
- primitives are still individually legible as sticks, wire, rows, cards, or
  debris;
- the result works only by changing atlas colour/content, meadow/root, fog,
  camera, terrain, water, sky, or palette;
- the route exceeds the old rejected all-card budget but still does not clearly
  improve readability;
- it looks visually promising but is too expensive, in which case hand off to
  03B5/03B6 with exact perf and triangle evidence instead of hiding the cost.

## Verification

- Capture `battle-map-reference-primitive-family` with the micro carrier beside
  `field-fiber-shell`, `texture-volume`, and `texture-carrier`.
- Archive full shots, crop sheets, target/candidate crops, and
  `compare-screenshots` artifacts under
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/`.
- Use `compare-screenshots` against target foreground/midground crops and against
  the field-shell baseline. Judge only carrier density/scale, primitive
  legibility, ground-plane exposure, and depth falloff.
- Run an unprimed `screenshot-critique` scoped to coverage continuity, primitive
  legibility, scale, ground-plane exposure, integration, and midground vegetation
  read before accepting.
- Open the review-worthy shots with `preview-shots` as a non-blocking checkpoint;
  if there is no response, decide from the evidence, record the verdict here, and
  continue.
- Keep `battle-map-reference-primitive-family`, `battle-map-reference`,
  `renderer-lab-routes`, `tsc --noEmit`, and the focused grass tests green.

## Next Slice

Continue with `03b4c5b4a-foreground-grass-scale-and-crop-contract.md` before
changing atlas colour, fog, camera, terrain, meadow, or root material. The
immediate question is no longer "how many carriers?" but "what close,
transition, and mid crop contract can fairly judge grass body before the close
lab begins?"
