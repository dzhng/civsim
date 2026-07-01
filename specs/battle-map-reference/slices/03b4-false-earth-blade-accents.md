# Slice 03B4 — false-earth blade accents

## Contract

With meadow mass carrying the field, add only the foreground blade geometry needed
for near-field depth and silhouette. The accent layer may borrow false-earth's
Bezier blade shaping, clump yaw, height AO, view thickness, and distance fade, but
it must keep civsim's palette and battle readability.

## Approach

Stay on the CPU field path for this slice. Either evolve `BattleGrassPass` or add
a sibling `BattleGrassBladePass` that consumes `grassField.ts` records. Do not
switch to compute yet.

Useful false-earth ideas to copy:

- Bezier/tapered blade strips with near/mid/far segment budgets;
- clump-center yaw plus per-blade yaw jitter;
- terrain-normal base alignment with tips biased toward sky;
- height-based AO/dark bases and distance desaturation;
- view-dependent thickness for side-on readability.

Carry forward the 03B2 critique as geometry guidance. Some packed-field clumps
look weakly seated because dark base marks and bright blades do not always share
a convincing root; some blades lean far enough to read as flattened against the
ground. This slice owns that visual fix. Prefer better base anchoring,
height-based darkening, tapered silhouettes, and distance fade over simply adding
more cards.

Carry forward the 03B3 boundary too. Start this slice from an accepted
field-driven meadow material where broad mass already reads correctly with
`grassBlades=0`. The accent layer should be additive: enable limited near-field
blade geometry only where it gives vertical depth, silhouette, and root texture
that the meadow material cannot supply. If the meadow crop only becomes convincing
after high blade counts are spread through the whole lower third, go back through
03B3A/03B3B instead of calling 03B4 done.

Concrete starting points:

- `BattleGrassPass.setGrassFieldSnapshot(...)` already consumes the 03B1 records
  and can draw zero blades for the 03B3 material proof. 03B4 may raise
  `bladesPerTuft` only after meadow mass is accepted.
- Keep `ground.stats().meadow.source === 'field'` as the mass owner in reference
  telemetry; foreground grass stats should explain only the accent budget.
- Test near, mid, and far LOD separately. False-earth-style Bezier strips should
  fade into the meadow material before they become stippled dots.

Current WIP / rejected path (2026-07-01):

- `BattleGrassPass.setGrassFieldSnapshot(...)` can now draw a bounded near-depth
  accent subset while preserving all field records for meadow ownership telemetry.
- `/renderer/battle-grass-field?mode=field-accent` is the isolated proof route.
- The reference fixture defaults to `grassTechnique=field-accent`; the zero-blade
  material proof remains available through `grassTechnique=field-meadow`.
- The old tuft default submitted about `83200` triangles at the reference camera
  and is rejected as sparse subpixel speckle.
- The current default reference WIP is `accentStyle=root-shadow`: about `2600`
  accent records, `10400` logical blade slots, and `41600` submitted triangles,
  with `ground.stats().meadow.source === 'field'`.
- This path is **not accepted**. The root-shadow primitive is cheaper and less
  noisy than the tuft mesh, but per-record ownership still reads as a smooth
  green plane with faint dots. Muting tip colour, reducing far depth, selecting
  only near-depth records, and parameter spikes (`wide-soft`, `dense-muted`,
  `tall-near`, wider root-shadow variants) still produce visible dots or strokes
  rather than soft meadow volume.

Reslice result (2026-07-01):

- 03B4A landed the named accent-style workbench: `tuft`, `root-shadow`,
  `fiber-ribbon`, and `hybrid-root-fiber`.
- `root-shadow` is now the default WIP because it is the least noisy and cheapest
  candidate, but it is **not accepted**.
- First-pass `fiber-ribbon` and `hybrid-root-fiber` are rejected: they add
  yellow/green speckle before useful grass volume.
- Per-record root-shadow is rejected as a final solution: the default is too
  faint/smooth, lower `surfaceBlend` reveals black stipple, and wider/lower-count
  root-shadow variants read as separated strokes.
- Foreground crop metrics still show the candidate missing target edge structure:
  foreground `edgeEnergyRatio ~= 0.44`, midground `~= 0.60`.
- Neutral critique says the candidate remains a smooth green ground plane with
  too little fuzzy/clumped volume, weak density falloff, and tiny speckles that
  read as noise/flowers rather than grass.

Subsequent 03B4B and 03B4B2 passes moved the data architecture forward but still
did not visually accept the grass target.

03B4B result:

- `BattleGrassPass.setGrassFieldSnapshot(...)` now supports clump aggregation and
  stats for `accentAggregation`, `accentSourceRecords`, `accentClumps`, and
  `accentTufts`.
- The clump reducer is useful and should stay.
- Hard root geometry is rejected: wide diamond marks, broad oval marks, and short
  root-fiber mats read as separated decal/glyph stains on a smooth plane.

03B4B2 result:

- The default WIP is now `accentStyle=soft-root-mass`, backed by an explicit
  `BattleGroundPass` root-mass material layer with `rootMassStrength`,
  `rootMassContrast`, `rootMassSpread`, and meadow stats for
  `rootMassEnabled`, `rootMassCoverage`, and `rootMassAvg`.
- The reference route reports `7000` field records, `157` clumps, `452`
  submitted soft-root accents, `18080` submitted accent triangles,
  `rootMassCoverage=0.061`, and `rootMassAvg=0.055`.
- This removes the obvious hard decal/glyph failure and is cheaper than 03B4B,
  but is **still visually rejected**. Compare artifacts under
  `assets/03b4-evidence/03b4b2-soft-root-mass/` report foreground
  `edgeEnergyRatio=0.433` and midground `0.760`; neutral critique says the
  candidate is a smooth painted/combed carpet with no blade silhouettes, clumps,
  or height variation.

03B4C then landed `soft-root-fiber` clump-ribbon plumbing and stats, but the
visual is rejected. The reference route reports `7000` field records, `157`
clumps, `452` accents, `2260` accent ribbons, `64` mesh triangles, and `28928`
submitted accent triangles; the crop still reads as a smooth carpet with sparse
flecks, and foreground/midground edge ratios stayed around `0.435` / `0.761`.
03B4C2 then landed `field-fiber-shell` and `field-near` telemetry, proving the
near shell can be field-owned instead of clump-owned. It is still visually
rejected. The reference route reports `7000` field records, `5200` submitted shell
records, `5200` ribbons, and `41600` submitted shell triangles, but the crop still
reads as a smooth green sheet with faint streaks. Compare artifacts under
`assets/03b4-evidence/03b4c2-field-fiber-shell/` report foreground
`edgeEnergyRatio=0.301` and midground `0.476`; neutral critique says the primary
visible failure is missing near-field grass silhouette, scratch/streak artifacts,
and weak scan readability. 03B4C3 then kept field-shell telemetry fixed and
proved the one-strip primitive/material path still fails. 03B4C4 then tested
mesh-only alternate primitive families and proved that they still fail before
they become dense grass.

03B4C3 status:

- The shell-off/normal/debug-visible harness landed with route-visible
  `fiberShellVariant` telemetry. It now also captures bounded
  `width`/`lift`/`view-thickness` variants and asserts each route reports the
  requested variant, so a silent fallback to `normal` cannot pass.
- The first debug-visible attempt is rejected: it exposes the shell mainly as
  tiny dark/yellow stipple and scratches rather than grass-like fiber structure.
- Normal shell is effectively indistinguishable from shell-off at the reference
  camera; debug-visible still reaches only foreground `edgeEnergyRatio=0.324`
  and midground `0.478` against target crops.
- Bounded primitive variants are also rejected. Width, vertical lift, and
  view-facing thickness all keep the same `5200` shell records and `41600`
  submitted triangles as normal shell, but foreground edge-energy movement versus
  normal is only about `1.002..1.003x` and midground is essentially unchanged.
  Neutral review says the candidates remain flat terrain/stipple/scratches/smear,
  not dense grass with blade height, clumped dark masses, or layered occlusion.

03B4C4 status:

- The primitive-family workbench landed with route-visible
  `grassPrimitiveFamily` telemetry and reference-camera captures for
  `field-fiber-shell`, `alpha-impostor`, `billboard-cluster`, and `volume-card`.
- The three new families use the clump reducer and stay under the old rejected
  all-card tuft cost, but they still read as sparse marks over a painted meadow
  plane.
- `alpha-impostor` is currently only a mesh-stroke stand-in. It is not a real
  alpha-texture impostor yet, and texture telemetry correctly reports zero bytes.
- Crop comparison under
  `assets/03b4-evidence/03b4c4-near-grass-volume-primitive-workbench/` shows only
  tiny movement toward the target: foreground edge ratios are about `0.302` for
  the shell baseline, `0.338` for the mesh alpha stand-in, `0.322` for billboard
  clusters, and `0.321` for volume cards; midground stays around `0.475..0.490`.
- Neutral review says `field-fiber-shell` is least wrong because it has the
  smoothest falloff and avoids loud card/stamp artifacts, but it still reads as
  flat brushed terrain with weak clumping and almost no upright blade silhouette.
  The mesh candidates read as stains, scratches, or isolated card flecks.

03B4C5 WIP status:

- `grassPrimitiveFamily=texture-volume` now exists as the first real
  texture-backed path in the primitive-family workbench. It keeps the 03B4C4
  evidence surface, the reference camera, the field records, the softened meadow,
  and the root material fixed while publishing nonzero atlas telemetry.
- The first clump-backed texture attempt is rejected: the old sparse clump set
  made the atlas appear as large repeated stamps.
- The current route uses `field-cell` aggregation so texture coverage is field
  owned rather than clump-only. This is the right architecture direction and
  should not be thrown away just because the first texture is ugly.
- A follow-up atlas/distribution pass muted the generated texture, increased the
  number of shorter strokes, darkened/rooted bases, clamped tile strokes, added
  deterministic sub-cell jitter, widened yaw jitter, and narrowed cards. It
  reduced the loudest yellow row read, but the visual is still rejected: the crop
  reads as discrete texture flecks/stamps over a smooth meadow, not soft grass
  volume.
- The 03B4C5A density/soft-coverage pass layered up to two records per selected
  field cell, capped the texture card mesh at 20 triangles, used lower-alpha
  meadow-coloured shader coverage, and recorded current route stats:
  `accentClumps=1900`, `accentTufts=2064`, `bladeInstances=8256`,
  `submittedTriangles=41280`, and `textureBytes=65536`.
- `compare-screenshots` against target crops now reports foreground
  `edgeEnergyRatio=0.73170` and midground `0.48966`. Against the
  field-fiber-shell baseline, texture-volume raises foreground edge energy
  `2.42334x` but barely moves midground (`1.02795x`). This proves the route can
  add near-crop edge structure, but it still has not produced continuous density.
- Neutral review rejected the result: it is still too sparse, reads as repeated
  stamps/cards/flecks with wrong scale, lacks fuzzy continuous grass volume,
  leaves too much flat ground plane exposed, and has weak midground/depth
  continuity.
- Keep 03B4C5A as evidence and continue with card/cell distribution and primitive
  scale before changing meadow/root material, fog, camera, terrain, atlas
  content, or shader coverage.
- A 03B4C5B placement/scale pass is now browser-verified and rejected:
  field-cell selection is distributed across view-depth/lateral buckets, yaw
  mixes camera-facing and record yaw, cells with at least two source records can
  layer a second record, texture records adjust off-center jitter,
  footprint/width/height/copy offset, and the texture-card mesh stays at 20
  triangles per record. Current stats remain `accentClumps=1900`,
  `accentTufts=2064`, `submittedTriangles=41280`, and `textureBytes=65536`.
  Target crop metrics fell back to foreground `edgeEnergyRatio=0.55962` and
  midground `0.48684`; versus field-shell, midground is only `1.02238x`.
  Neutral critique says the shot still reads as sparse clusters/specks with
  legible primitives, abrupt depth falloff, exposed ground plane, visible rows,
  weak integration, and almost no midground vegetation read.
- Current full/crop evidence is archived under
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/`.
- 03B4C5B2 added a same-atlas `texture-carrier` family with larger field-cell
  carrier sheets (`accentClumps=2400`, `submittedTriangles=38400`) and is also
  rejected. The foreground edge movement is hard straw/wire primitive structure
  (`2.80502x` target edge energy; `9.22257x` versus field-shell), while the
  midground remains under-target and the full shot reads as patchy carrier
  islands.
- 03B4C5B3 added a same-atlas `texture-micro-carrier` family with many smaller
  field-owned carriers (`accentClumps=4600`, `accentTufts=7000`,
  `grassPrimitiveMicroCards=28000`, `submittedTriangles=56000`,
  `instanceBytes=448000`). It is browser-verified and rejected. The route avoids
  large straw sheets, but at the reference camera it is nearly invisible or reads
  as pixel grit/dirt specks. Target foreground edge energy is only `0.27844x`
  and midground `0.37539x`; versus field-shell, parity barely moves
  (`0.02108` foreground, `0.05422` midground). Density/count alone is not the
  missing variable.
- 03B4C5B4 has since been resliced into a close-lab ladder. B4B1A1U,
  B4B1A1V, and B4B1A1W are rejected: source density, source-attached strand
  mats, and material-only field domains still create markers, fan/card patches,
  or flat paint rather than continuous body. The current pickup is B4B1A1X.
  Freeze atlas, palette, meadow/root, camera, terrain, fog, water, sky, and crop
  windows; keep body ownership field-owned while adding silhouette/height before
  any perf, coverage, LOD, or camera-relative pass.

Current approach queue:

1. **03B4C5B card/cell distribution and primitive scale.** Verified/rejected.
   Keep it as evidence that placement/scale alone still produces isolated marks.
2. **03B4C5B2 continuous coverage carrier spike.** Verified/rejected. Keep it as
   evidence that large overlapping field-cell sheets become hard straw/wire
   islands before they become grass.
3. **03B4C5B3 micro-blade density carrier spike.** Verified/rejected. Keep it as
   evidence that more/smaller carriers are mostly invisible or pixel grit at the
   reference camera.
4. **03B4C5B4 minimum visible grass-body carrier.** Current pickup. Keep B3
   density, selection, atlas, palette, meadow/root material, camera, terrain,
   fog, water, sky, lighting, and crop windows fixed. Change only the visible
   body/occupancy envelope of the existing micro primitives.
5. **03B4C5C atlas tile content and color integration.** Reopen atlas content,
   alpha, and tip/base colour only after B4 proves the carrier can form visible
   foreground grass body.
6. **03B4C5D midground continuity and depth falloff.** Tune depth/LOD only after
   foreground body and atlas integration are credible; use the midground crop as
   the primary comparison.
7. **Winning-family implementation slice.** If 03B4C5 finds a viable primitive
   family, split it into a follow-up implementation slice before polishing
   colour, density, or depth LOD.
8. **03B4D depth LOD compose.** Compose accepted root and near-field layers with
   explicit near/mid/far ownership. Keep root-only and ribbon-only proof modes so
   a future pass can isolate regressions.

Follow the resliced files:

- `03b4a-accent-candidate-workbench.md` — landed candidate plumbing and recorded
  the first rejected primitive matrix.
- `03b4b-clump-root-shadow-volume.md` — clump aggregation/stats landed; hard
  root geometry rejected.
- `03b4b2-soft-root-mass-impostor.md` — soft material root layer landed; visual
  rejected as smooth painted/combed carpet.
- `03b4c-near-fiber-ribbon-silhouette.md` — `soft-root-fiber` clump-ribbon
  telemetry landed; visual rejected as sparse flecks over smooth carpet.
- `03b4c2-near-field-fiber-shell.md` — field-shell telemetry landed; visual
  rejected as smooth sheet with faint streaks despite 5200 shell records.
- `03b4c3-fiber-visibility-and-shading.md` — harness/telemetry landed; one-strip
  shell primitive rejected after material, width, lift, and view-thickness tests.
- `03b4c4-near-grass-volume-primitive-workbench.md` — workbench/telemetry landed;
  mesh-only alternate families rejected as sparse marks/stamps.
- `03b4c5-texture-backed-grass-volume.md` — parked parent/ledger for the
  texture-backed route; atlas/distribution and density/soft-coverage passes
  exist, but the visual is still rejected and follow-up work is resliced into the
  close-lab ladder.
- `03b4c5a-density-and-soft-coverage-record.md` — landed/rejected data-density
  and shader-coverage pass; use as evidence, not a target to keep polishing.
- `03b4c5b-card-cell-distribution-and-scale.md` — verified/rejected; placement
  and scale alone still read as sparse flecks/stamps.
- `03b4c5b2-continuous-coverage-carrier-spike.md` — verified/rejected; large
  carrier sheets read as hard straw/wire islands.
- `03b4c5b3-micro-blade-density-carrier-spike.md` — verified/rejected; many
  smaller field-owned texture primitives are mostly invisible or pixel grit at
  the reference camera.
- `03b4c5b4-minimum-visible-grass-body-carrier.md` — current pickup; keep B3
  density/content fixed and test only visible grass-body envelope.
- `03b4c5c-atlas-tile-content-and-color-integration.md` — future isolated atlas
  and colour pass, only after B4 proves foreground body visibility.
- `03b4c5d-midground-continuity-and-depth-falloff.md` — future isolated
  midground/depth pass.
- `03b4d-depth-lod-compose.md` — compose near/mid/far ownership before 03B5.

Stop conditions for the next pass:

- If the active 03B4C5 sub-slice still reads as dots, decals, repeated stamps,
  straw sheets, or card walls after one focused pass, do not tune atlas, count,
  and LOD together; use `feature-slicing` to split the active variable again
  before editing more code.
- If a candidate only works by changing meadow colour, fog, cliff shape, or
  camera framing, reject it for 03B4 and record the hidden dependency.
- If a candidate improves edge metrics but neutral review still calls it stipple,
  keep the code only as WIP evidence and update this ledger rather than accepting
  the slice.

Things not to copy:

- Three.js/TSL, Leva controls, character push/waves, emissive/neon/metallic
  material settings, and false-earth's exact cool color palette.

## Fixed Inputs

- Freeze the accepted Slice 03B3A/03B3B meadow layer, or the explicit 03B3B
  handoff decision that remaining meadow volume belongs to geometry.
- Keep cliff shape/texture, sky, fog, water, and final composition fixed.
- Keep broad color/softness tuning minimal; Slice 03C owns final grass color and
  sparkle.

## Accept / Reject

Use foreground and midground grass crops. Judge:

- near foreground has blade silhouettes and clumped vertical depth;
- midground does not dissolve into bright stippled dots;
- no circular focus mask or hard density boundary is visible;
- route stats show materially less geometry than the rejected card-only spike for
  the same apparent density.

Reject if the current opaque tuft mesh remains visibly sharp/spiky and no
alternative strip/material path is tried.

Also reject if the accent layer reads as isolated yellow/green dots over the
meadow material, even when route metrics improve.

## Verification

- `battle-map-reference` writes updated candidate and grass crop artifacts.
- `battle-map-reference-primitive-family` stays green while the current workbench
  remains the comparison surface.
- Use `compare-screenshots` on foreground and midground grass crops to compare
  accent coverage, stipple/noise, and density falloff.
- Run unprimed `screenshot-critique` scoped to foreground grass accent geometry
  only.
- `battle-grass`, `battle-terrain-3d`, `battle-terrain-elevation`, and
  `full-game-rendering-performance` stay green.

## Next Slice

Continue with `03b4c5b4-minimum-visible-grass-body-carrier.md`.
