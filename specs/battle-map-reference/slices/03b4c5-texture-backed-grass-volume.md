# Slice 03B4C5 - texture-backed grass volume

## Contract

Create the first real texture-backed near-grass primitive that can plausibly
carry the reference foreground's dense fuzzy volume without changing meadow
colour, fog, camera, terrain, cliffs, water, sky, or root material strength.

03B4C4 proved the route and telemetry surface but rejected mesh-only patch,
billboard, and volume-card stand-ins. The next missing variable is not another
mesh shape; it is high-frequency blade coverage packed into a soft alpha/volume
primitive.

Freeze these inputs:

- 03B3A softened field meadow coverage;
- 03B4B2 soft root material;
- 03B4C3/03B4C4 field records, clump reducer, depth band, reference camera, and
  foreground/midground crop windows;
- terrain, cliffs, water, sky, fog, lighting preset, meadow colour, and route
  framing.

## Approach

Start with deterministic CPU-generated texture assets and existing WebGPU
instancing. Do **not** start by porting false-earth compute, Three.js/TSL, or
indirect draw architecture. B4C0 decides backend policy later; GPU-native
generation is only a backend behind the same camera-relative domain if B4C0 or
03B5 proves the accepted CPU path is too expensive.

Build one focused workbench route variant, not a final renderer integration:

- Generate a small grass alpha atlas or texture array at init time. Each tile
  should contain many soft blade strokes with darker bases, lighter muted tips,
  height-faded alpha, and mip-friendly coverage. Use civsim's neutral Aegean
  grass palette, not false-earth's colours.
- Seat cards or shallow volume slices from field/clump records. Bases follow the
  terrain normal; tips blend toward world-up so the grass reads upright instead
  of painted onto the ground.
- Use slope and depth filters already available in the field data. No grass on
  cliffs, no broad field colour changes, no camera/fog compensation.
- Publish texture telemetry: atlas width/height/layers/bytes, clump or field-cell
  count, submitted cards, submitted triangles, selected field records, depth band,
  and active baseline.

## Candidate Variants

1. **Alpha atlas clump patch**
   - One or a few upright/seated cards per clump, each sampling a generated
     multi-blade alpha tile.
   - Good if foreground becomes continuous fuzzy vegetation while individual
     cards stay hidden.
   - Reject if it reads as decals, flowers, repeated stamps, or X-card artifacts.

2. **Layered volume ribbon**
   - A shallow stack of camera-aware alpha slices per clump/field cell, with base
     alpha hugging the ground and tips fading upward.
   - Good if it creates lower-third grass body without a billboard wall.
   - Reject if it forms comb rows, a translucent curtain, or hides unit
     readability at playable zoom.

3. **Field-cell impostor carpet**
   - Aggregate field records into deterministic cells and draw a low card budget
     per cell using the atlas, so density comes from texture coverage rather than
     per-record geometry.
   - Good if midground becomes soft grass mass instead of stipple.
   - Reject if cell boundaries, tiling, or repeated noise are visible.

## Current Approach Ledger

2026-07-01 WIP state: the first real texture-backed primitive route now exists,
has atlas/distribution, density/soft-coverage, and placement/scale refinement
passes recorded, and is **not visually accepted**.

Keep these implementation learnings for the next pass:

- `grassPrimitiveFamily=texture-volume` is the right comparison surface for this
  slice. It uses the 03B4C4 primitive-family harness, keeps the same reference
  camera/crops, preserves the 03B3A meadow and 03B4B2 root material, and publishes
  real texture telemetry instead of the previous zero-byte mesh impostor.
- The clump-backed texture attempt is rejected. Reusing the 03B4C4 clump reducer
  left only the old sparse clump count, so the atlas appeared as large repeated
  stamps instead of continuous grass body.
- The current WIP route switches texture-volume to deterministic `field-cell`
  aggregation. It reduces the same field records into many smaller field cells,
  reports `accentAggregation='field-cell'`, and keeps the submitted triangle cost
  under the old rejected all-card tuft path while proving a real generated atlas.
- The first atlas/card result is rejected. The foreground crop became denser, but
  the added marks read as yellow repeated rows/stamps, not the reference's soft,
  cool, fuzzy grass volume.
- The follow-up atlas/distribution pass muted the generated atlas, increased the
  number of shorter strokes, darkened/rooted bases, clamped tile strokes to avoid
  bleed, added deterministic sub-cell jitter, widened yaw jitter, and narrowed
  card width. It reduced the most obvious yellow row read, but it still fails:
  the crop reads as discrete texture flecks/stamps over a smooth meadow plane.
- `renderer-lab-routes` now treats the focused
  `battle-grass-field?mode=field-accent&grassPrimitiveFamily=texture-volume`
  route as a valid `field-cell` texture-volume proof. Before that contract fix,
  the route rendered and published telemetry but reported `ok:false`, causing the
  route suite to time out.
- The atlas/distribution pass was useful evidence and plumbing, not a visual
  win. Against the target crops, `compare-screenshots` reported foreground
  `edgeEnergyRatio=0.49861` and midground `edgeEnergyRatio=0.48280`; both remain
  roughly half the target edge density and the candidate is much darker
  (`avgLuminanceDelta=-22.28` foreground, `-45.87` midground). Against the
  field-fiber-shell baseline, texture-volume raises foreground edge energy
  `1.65137x` but barely moves midground (`1.01355x`), which means that pass
  changed the near crop without solving the reference density body.
- The follow-up density/soft-coverage pass raised the texture-volume route to
  `1900` field cells, `2064` submitted texture records, `20` mesh triangles per
  record, and `41280` submitted triangles. The shader now treats low-alpha atlas
  pixels as soft meadow-coloured coverage instead of only hard cutouts. Metrics
  moved in the foreground (`edgeEnergyRatio=0.73170` against target,
  `2.42334x` versus field-fiber-shell), but midground barely moved
  (`edgeEnergyRatio=0.48966` against target, `1.02795x` versus field-fiber-shell).
  Neutral screenshot critique rejected the visual with high confidence: it still
  reads as sparse repeated stamps/cards/flecks, lacks fuzzy continuous volume,
  has wrong grass scale, weak midground falloff, a flat exposed ground plane,
  smeared base streaks, and poor yellow-olive primitive integration.
- The 03B4C5B placement/scale pass then distributed selected field cells across
  view-depth/lateral buckets, mixed camera-facing and source-record yaw, adjusted
  jitter/footprint/width/height/copy offset, and kept the same 1900-cell/2064-record
  budget. It is also rejected. Current target-crop metrics are foreground
  `edgeEnergyRatio=0.55962` and midground `0.48684`; versus field-shell, foreground
  edge energy is `1.85248x` while midground is only `1.02238x`. Neutral critique
  says the shot still reads as sparse clusters/specks with legible individual
  primitives, abrupt depth falloff, exposed ground plane, visible rows/arcs, weak
  integration, and almost no midground vegetation read. Placement/scale alone did
  not turn the current route into continuous grass body.
- The 03B4C5B2 continuous carrier pass added `texture-carrier` as a separate
  same-atlas primitive family. It selects larger field-cell carrier records
  (`accentClumps=2400`, `accentTufts=2400` in the reference route), extends the
  depth band to `35..460`, lowers the mesh to `16` triangles per record, and
  submits `38400` triangles with the same `65536` atlas bytes. It is rejected.
  Target-crop metrics show foreground edge energy overshooting to `2.80502x`
  with hard stick/card structure while midground remains under-target at
  `0.71075x`; versus field-shell, foreground edge energy jumps `9.22257x` but
  midground only reaches `1.47418x`. Neutral critique calls the visible result
  patchy coverage islands, exposed ground, stick/wire primitives, too-large
  scale, weak integration, collapsed midground, and abrupt depth transition.
  Large overlapping sheets are therefore not the right carrier.
- The 03B4C5B3 micro-density pass added `texture-micro-carrier` as a same-atlas,
  fixed-palette primitive family. It reduces the mesh to `8` triangles per
  record (`4` micro cards), selects `4600` field cells, emits `7000` records,
  publishes `28000` micro cards, submits `56000` triangles, and uses `448000`
  instance bytes plus the same `65536` atlas bytes. It is browser-verified and
  **rejected**. Against the target crops, foreground edge energy falls to
  `0.27844x` and midground to `0.37539x`; versus field-shell, the micro path is
  almost unchanged (`parityDistance=0.02108` foreground, `0.05422` midground).
  Direct inspection and neutral critique say it reads as flat green ground with
  scattered dark/brown specks, weak midground vegetation, abrupt depth falloff,
  and pixel-grit primitives rather than grass. Density/count is therefore not
  the hidden missing variable.
- Current evidence is archived in
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/`: the full
  `texture-volume`, `texture-carrier`, and `texture-micro-carrier` shots,
  primitive-family crop sheet, normalized target/candidate crops,
  `diff*/visual-parity-diff.json`, carrier-specific `diff-carrier*/` artifacts,
  and micro-specific `diff-micro*/` artifacts plus
  `texture-micro-carrier-stats.json`.

Resliced approach queue:

1. **03B4C5A density and soft coverage record** — landed/rejected in
   `03b4c5a-density-and-soft-coverage-record.md`. Do not keep turning count,
   shader coverage, and mesh budget together; the evidence says this mostly
   increased foreground edge while preserving the fleck/stamp failure.
2. **03B4C5B card/cell distribution and primitive scale** — verified/rejected in
   `03b4c5b-card-cell-distribution-and-scale.md`. Do not keep tuning placement
   and scale alone; the evidence says the route still reads as isolated marks.
3. **03B4C5B2 continuous coverage carrier spike** — landed/rejected in
   `03b4c5b2-continuous-coverage-carrier-spike.md`. Do not keep enlarging
   field-cell carrier sheets; the evidence says that path creates hard straw/wire
   islands, not continuous grass body.
4. **03B4C5B3 micro-blade density carrier spike** — landed/rejected in
   `03b4c5b3-micro-blade-density-carrier-spike.md`. Do not keep increasing
   carrier count or shrinking cards; the evidence says that path is invisible or
   pixel grit at the reference camera.
5. **03B4C5B4 minimum visible grass-body carrier** — resliced after David's
   camera-scale feedback. Do not implement this as one full-reference-camera
   visibility pass; the current route is only focus/depth selected CPU records,
   not false-earth-style camera-relative procedural grass.
6. **03B4C5B4A foreground grass scale and crop contract** — current pickup, not
   accepted yet. Red close-hero is usable; orange transition needs tightening;
   blue mid-mass is rejected as cliff/fog/sky contamination. Prove the crop
   contract before more renderer tuning.
7. **03B4C5B4B1 close foreground grass lab route** — build the close grass-only
   workbench and prove close review scale.
8. **03B4C5B4B1R close lab scale and perspective repair** — repair the rejected
   lab camera/crop scale without tuning grass art.
9. **03B4C5B4B1A close body technique spike** — choose the fixed-camera close
   body representation and record its local perf envelope without deciding CPU
   versus GPU generation.
10. **03B4C5B4B2 close body coverage** — solve dense soft foreground body and
   exposed-ground ratio.
11. **03B4C5B4B3 close strand scale** — solve strand size and direction after
   coverage is accepted.
12. **03B4C5B4B4 clump softness and height variation** — solve clump envelope and
   height rhythm.
13. **03B4C5B4B5 close palette and atlas lock** — lock close-lab colour, atlas
   opacity, and tile integration without changing density or body shape.
14. **03B4C5B4C0 camera-relative backend spike** — prove that grass generation is
   camera-position procedural in world space, set the CPU/GPU backend policy, and
   record perf gates without changing the accepted close look.
15. **03B4C5B4C1 camera-relative field domain** — CPU-first false-earth-style
   snapped cells/rings, stable origin, and churn telemetry.
16. **03B4C5B4C2 terrain-normal and slope eligibility** — terrain-normal
   attributes plus slope/water/tint rejection.
17. **03B4C5B4C3 surface tilt and tip blend** — bases hug terrain and tips recover
   upward without changing body art.
18. **03B4C5B4D1 LOD band contract** — define near/transition/mid/far ownership
   bands and telemetry.
19. **03B4C5B4D2 near-to-transition collapse** — readable close strands fade into
   clumped soft body.
20. **03B4C5B4D3 mid-mass continuity** — midground becomes continuous vegetated
   mass without readable primitives.
21. **03B4C5B4D4 depth falloff sequence** — verify close/transition/mid crops as
   one coherent depth sequence.
22. **03B4C5B4E grass-only reference crop compose** — integrate the accepted
   close/procedural/LOD stack into `battle-map-reference` while judging only
   grass crops/masks.
23. **03B4C5C atlas tile content and colour integration** — reference-route atlas
   regression only, after B4A, B4B1R, B4B1A, B4B2-B4B5, B4C0-B4C3, B4D1-B4D4,
   and B4E prove lab scale, body, close palette, camera-relative generation, and
   LOD. Change generated atlas shape/colour/opacity only where the accepted
   close-lab palette/atlas lock fails at reference scale.
24. **03B4C5D midground continuity and depth falloff** — only within the accepted
   camera-relative LOD architecture. The current midground remains almost
   unchanged from field-fiber-shell and needs its own crop gate.
25. **Perf/adoption pass** — B4C0 sets the backend policy before C1; 03B5 later
   verifies gameplay readability and adoption cost. 03B6 is only the backend swap
   if B4C0 or 03B5 proves CPU-built camera-relative cells are too expensive.

If the next implementation starts changing more than the active sub-slice's
single visual variable, stop and reslice again before editing more renderer code.

## Accept / Reject

Accept the approach only if the foreground crop visibly gains continuous
grass-like fiber density and the midground reads as soft vegetated mass. A small
edge-metric improvement is not enough if neutral review still calls the result
speckles, scratches, decals, stains, rows, or painted terrain.

Reject or reslice if:

- visual density comes only from changing meadow/root/fog/colour/camera inputs;
- texture telemetry is missing or reports zero bytes for the accepted path;
- repeated stamps or alpha-card artifacts are the dominant visible structure;
- the path only works by exceeding the rejected all-card tuft cost without a
  clear perf follow-up.

## Verification

- Add a scene or extend `battle-map-reference-primitive-family` so the new
  texture-backed variant is captured beside the 03B4C4 shell baseline and the
  best mesh stand-in.
- Archive full shots, crop sheets, generated target/candidate crop pairs, and
  `compare-screenshots` artifacts under
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/`.
- Use `compare-screenshots` against the foreground and midground target crops and
  against the 03B4C4 baseline. Judge grass density/texture only.
- Run an unprimed `screenshot-critique` or neutral subagent review scoped to
  grass density, fuzzy volume, primitive artifacts, and depth falloff only.
- Keep `battle-grass-field`, `battle-map-reference-primitive-family`,
  `battle-map-reference`, and `renderer-lab-routes` green.

## Next Slice

Continue with
`03b4c5b4a-foreground-grass-scale-and-crop-contract.md`: fix the rejected
orange/blue crops before moving into B4B1. The texture-backed path is still useful
plumbing, but 03B4C5 is not visually accepted and the full vista is no longer the
discovery surface for close grass.
