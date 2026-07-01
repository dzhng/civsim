# Slice 03B4C5B4B1R - close lab scale and perspective repair

## Status

Attempted/rejected on 2026-07-01. This slice landed useful route evidence and a
closer named camera profile, but it did **not** make the close lab a fair
comparison surface. Do not keep repairing camera scale with proxies alone;
proceed to B4B1A0 and first build a true close grass test environment.

## Contract

Repair the B4B1 close grass lab so it becomes a fair close-camera review surface.
This slice owns **camera scale, ground-plane perspective, and review-window
calibration only**.

Out of scope: grass body representation, density tuning, strand shape, clump
rhythm, atlas art, colour, lighting palette, fog, terrain/cliff/water/sky
composition, camera-relative generation, LOD collapse, and final reference
compose.

## Current Evidence

B4B1 landed useful route infrastructure at
`/renderer/battle-grass-field?mode=foreground-close-lab`, but its acceptance
failed. Evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/lab-route/`.

- Target close crop: `760x180`.
- Lab close crop: `815x182`, center-cropped to `760x180` only for comparison.
- Default lab stats: camera `{x:0,y:-36,zoom:104,pitch:0.78,yaw:-0.08}`,
  `1554` accepted field records, `1343` field-fiber-shell tufts, `10744`
  submitted triangles.
- Normalized close-crop comparison: `parityDistance=0.25805`,
  `edgeEnergyRatio=0.13997`.
- Unprimed critique verdict: **unfair scale**. Visible issues: flat green ground,
  missing close blade/body depth, weak perspective cues, too-uniform lighting,
  smear/blur, artifact-like isolated strokes, and transition/mid crops that do
  not yet help judge close grass quality.

## Result / Learning

The repair pass added `labCameraProfile` variants and selected
`scale-repair-low`:

- camera `{x:0,y:-47,zoom:155,pitch:0.92,yaw:-0.06,perspective:0.030}`;
- closer/lower review windows for close hero, tight 2x/4x, transition, and
  mid-mass crops;
- neutral calibration guides under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/scale-repair/`;
- frozen grass inputs: same seed, field records, meadow/root base, and
  `field-fiber-shell` primitive family.

The evidence still failed acceptance. The selected close crop was not comparable
to the target: `compare-screenshots` reported `parityDistance=0.25268` and
`edgeEnergyRatio=0.13216`, and the unprimed critique verdict was **unfair scale**.
The target has dense vertical grass body and dark inter-blade mass; the selected
crop remains mostly smooth green ground with faint smears/scratches. The
close/transition/mid sequence also reads as the same flat plane, so calibration
rods cannot stand in for the missing body layer.

Record B4B1R as rejected evidence. The next pass should stop changing camera,
fog, palette, terrain, cliffs, or the full reference route, and instead build
B4B1A0's fair close foreground test environment before comparing body
representation techniques in B4B1A1.

## Approach

- Start from the existing `foreground-close-lab` route and B4B1 evidence. Do not
  create another broad reference route.
- Freeze terrain patch, field records, seed, meadow/root material, rejected
  primitive-family baselines, palette, and overcast lighting unless a value is
  explicitly part of the camera/perspective contract.
- Adjust only camera position, zoom, pitch/yaw/perspective, crop/window bounds,
  and optional neutral calibration aids.
- If the current grass primitives cannot prove scale because they are visually
  absent, add a clearly non-final calibration mode or overlay: neutral blade
  height markers, ground-plane rulers, or simple monochrome proxy clusters sized
  from the target close crop. These proxies exist only to calibrate camera scale
  and perspective; they are not accepted grass art.
- Capture at least three candidate camera/crop settings in one contact sheet:
  current B4B1, closer/lower, and one alternate perspective. Record why the
  selected setting is less wrong.
- Keep transition and mid-mass windows lab-owned. They should show useful depth
  progression from the same camera, but they do not need accepted LOD grass yet.

## Accept / Reject

Accept if the lab gives a fair close foreground surface: target and lab crops are
comparable in foreground scale, the ground plane has enough depth cues to judge
near/transition/mid relationships, and a future B4B1A1 body technique can be
rejected or accepted without changing camera, cliffs, fog, water, or the full
reference composition.

Reject if the only way to look fair is to tune grass density/body/art, palette,
fog, terrain colour, or full-scene composition; if the lab remains a flat
wide-vista crop; or if transition/mid windows still cannot be interpreted as a
depth sequence.

## Verification

- Archive camera candidate contact sheet, chosen full shot, target close crop,
  chosen lab close crop, 2x/4x tight crops, transition/mid crops, route stats
  JSON, and calibration overlay/proxy shots if used under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/scale-repair/`.
- Use `compare-screenshots` against the target close crop for scale and
  perspective comparability only. Record distance/edge numbers as diagnostics,
  not as visual grass acceptance.
- Run unprimed `screenshot-critique` scoped to: "Is this close lab now a fair
  camera/crop surface for judging target foreground grass scale and perspective?"
- Open the selected contact sheet with `preview-shots` as a non-blocking
  checkpoint.
- Keep the focused lab scene, `renderer-lab-routes`, and `tsc --noEmit` green.

## Next Slice

Continue with `03b4c5b4b1a0-close-grass-test-environment.md`. B4B1A0 no longer
waits for B4B1R acceptance; it inherits the B4B1/B4B1R rejection as proof that a
fair close body lab must be built before the body architecture can be judged.
