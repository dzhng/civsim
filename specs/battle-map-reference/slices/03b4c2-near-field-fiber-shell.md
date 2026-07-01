# Slice 03B4C2 - near field fiber shell

## Contract

Add the missing near-foreground fiber/grass silhouette using a separate,
budgeted near-field ownership layer fed by the existing 03B1 field records.

This is a reslice after 03B4C. The `soft-root-fiber` clump-ribbon pass landed
useful route/style/stats plumbing, but it is visually rejected: 157 clumps and
452 submitted accents do not provide enough crop-scale emitters for the reference
camera. More geometry per clump turns into stipple before it becomes dense
meadow fiber.

Freeze these inputs:

- 03B3A field meadow coverage and the 03B3B handoff decision;
- 03B4B/03B4B2 clump reducer and soft root-mass material;
- camera, fog, terrain, cliff shape/texture, water, sky, meadow colour, and crop.

The slice owns only the near-field fiber shell: how many field records submit a
cheap silhouette primitive, how those primitives fade by depth/slope, and whether
they produce the continuous tangled foreground structure visible in the target.

## Approach

Keep `soft-root-fiber` available as rejected evidence and a route comparison
mode, but do not keep tuning its width, count, height, or colour as the main
solution. The next hypothesis is that the reference needs many more near emitters,
but each emitter must be much cheaper and quieter than the old all-card tuft path.

Implementation seam:

- add a new named style/path such as `near-field-fiber`, `field-fiber-shell`, or
  `soft-field-fiber`; do not overload `soft-root-fiber`;
- feed it from the 03B1 field records inside a strict near-depth band, not only
  from the reduced clump accent set;
- keep the 03B4B2 root material enabled so clumps still own broad dark base mass;
- submit one or two muted, dark-rooted tapered strips per selected field record;
- seat strip bases on the terrain tangent plane, using the packed terrain normal
  and slope mask already proved by 03B2;
- blend growth from terrain normal toward world-up by height so tips stand up
  without floating off steep surfaces;
- fade contrast, width, and submit probability before the midground crop;
- keep tips in olive shadow/mid tones. Bright straw/yellow tips already failed as
  speckle.

The primitive should be closer to a "fiber shell" than a visible blade model:
thin enough and cheap enough to be emitted by many near records, but wide/dark
enough to survive the reference crop as soft vertical edge structure.

Use the 03B4C neutral critique as the failure baseline:

- avoid small yellow/brown scratches, flower-like dots, or isolated dash patterns;
- avoid radial/streaming ground streaks that pull toward the camera;
- avoid inconsistent fiber scale where near/mid dashes do not foreshorten;
- aim for the target's stronger grass-density/silhouette read, but do not copy
  its blur/smear as a solution.

## Candidate Spike Matrix

Run the first pass as a small matrix rather than one final-looking attempt:

1. **Root-only baseline:** current `soft-root-mass`/`soft-root-fiber` route with
   the near shell disabled. This proves the crop/camera/material did not move.
2. **Sparse shell:** selected near field records, one strip each, strict fade
   before the midground. This tests whether emitter count alone changes the
   foreground edge structure.
3. **Cross shell:** selected near field records, two crossed strips with shared
   dark base. This tests whether minimal local volume beats isolated line marks.
4. **Density cap sweep:** hold primitive shape fixed and only change selected
   record ratio/depth cutoff. Stop when the midground starts reading as stipple.

Record rejected approaches inside this file as soon as they fail. A future pass
should see which variable failed without rereading code or screenshots.

## Current Result

03B4C2 landed the field-owned shell architecture and telemetry, but the visual is
**rejected**.

Landed architecture:

- `GrassAccentStyle` includes `field-fiber-shell`;
- `GrassAccentAggregation` includes `field-near`;
- `BattleGrassStats` reports `fiberShellSourceRecords`,
  `fiberShellRecords`, `fiberShellRibbons`, `fiberShellDepthNear/Far`,
  `fiberShellSelectedRatio`, and `fiberShellSubmittedTriangles`;
- `/renderer/battle-grass-field?mode=field-accent` and the reference route now
  assert the default shell path is field-owned, not clump-owned;
- the zero-blade `field-meadow` proof and 03B4B2 root material stay intact.

Final current reference stats:

- `fieldRecords: 7000`
- `accentStyle: "field-fiber-shell"`
- `accentAggregation: "field-near"`
- `accentSourceRecords: 7000`
- `fiberShellRecords: 5200`
- `fiberShellRibbons: 5200`
- `fiberShellSelectedRatio: 0.743`
- `meshTriangles: 8`
- `submittedTriangles: 41600`
- `rootMassEnabled: true`
- `rootMassStrength: 1.24`

Rejected visual evidence:

- Compare artifacts are under
  `assets/03b4-evidence/03b4c2-field-fiber-shell/`.
- Foreground `edgeEnergyRatio=0.301`; midground `edgeEnergyRatio=0.476`.
  Against the target crops, the candidate still has far less useful edge
  structure even though it submits many more shell records.
- Direct inspection: foreground and workbench still read as a smooth green sheet
  with faint radial/streaming streaks. The shell is mostly invisible at crop
  scale; isolated marks still read as scratches/specks rather than vegetation.
- Neutral critique says B is missing near-field grass silhouette, has uniform
  density falloff, scratch/streak artifacts, artificial ground-plane perspective,
  low edge detail, weak terrain readability, too-even lighting, tiny stipple
  noise, and scale mismatch. A is also soft, but it has better clumps and fiber
  silhouette.

Learning:

- The hidden variable is not only emitter ownership or emitter count. The
  field-record shell is now data-owned correctly, but the primitive/material is
  not visible enough at the reference camera.
- Do not keep increasing `fiberShellRecords` or widening the depth band as the
  next primary move. `5200` one-strip records already hit `41600` triangles and
  still do not create the target's tangled foreground silhouette.
- The next pass should isolate **fiber visibility and local shading** before
  more density work: make a deliberately visible shell variant, compare it to
  shell-off and normal-shell, then dial it back only if it actually creates
  readable grass structure.

## Required Telemetry

`BattleGrassStats` or a clearly named companion stats object must distinguish the
new shell from the 03B4B/03B4C clump data:

- `fiberShellSourceRecords` or equivalent total source field records;
- selected/submitted field-record count for the shell;
- submitted fiber ribbons/strips;
- near and far depth cutoff actually used;
- selected/source ratio;
- submitted triangles attributable to the shell;
- active style name and aggregation/source mode, for example `field-near`;
- root material stats remain visible (`rootMassEnabled`, coverage, strength).

The route must fail loudly if the new style is active but the shell record/ribbon
counts are zero or indistinguishable from clump-only `accentTufts`.

## Accept / Reject

Accept if:

- the lower foreground gains continuous small vertical/tangled edge structure
  relative to root-only, without relying on broader colour/fog/camera changes;
- the midground remains meadow/root tone rather than bright dots, black strokes,
  or regular rows;
- neutral critique no longer calls the grass a smooth painted/combed carpet as
  the primary blocker;
- route stats prove materially more near emitters than 03B4C clump ribbons while
  staying below the rejected old all-card tuft cost for the same camera.

Reject if:

- the result reads as yellow/brown flowers, black hatch marks, hairline aliasing,
  or rowed crops;
- the ground still reads as a smooth green sheet with sparse scratch marks;
- the shell creates radial/streaming streaks toward the camera;
- the apparent improvement comes from changing meadow colour, root mass strength,
  fog, camera, terrain, cliffs, water, sky, or target crop;
- the spike only works by reintroducing the old high-card all-field tuft path;
- midground stipple appears before the foreground gains real volume.

## Verification

- Capture root-only, shell-only if available, and composed shots from the same
  `battle-map-reference` camera.
- Use `compare-screenshots` on foreground and midground grass crops. Compare
  03B4C2 against the 03B4B2/03B4C root-only baseline first, then against the
  target. Do not score whole-frame similarity.
- Run unprimed `screenshot-critique` scoped to near-field fiber silhouette,
  density falloff, and stipple only.
- Keep `battle-grass-field`, `battle-map-reference`, and `renderer-lab-routes`
  green. The route assertions must include the new shell telemetry.

## Next Slice

Continue with `03b4c5-texture-backed-grass-volume.md`. Keep the field-shell
telemetry and data ownership from this slice, the 03B4C3 harness, and the 03B4C4
primitive-family telemetry, but stop tuning the one-strip shell primitive or the
mesh-only stand-ins. Try true texture-backed alpha/volume coverage before more
density/depth tuning.
