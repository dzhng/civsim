# Slice 03B4C5B4B1 - close foreground grass lab route

## Status

Landed/rejected on 2026-07-01. The route, scene, route contract, snapshots, and
evidence pack landed, but the camera/review scale did **not** pass acceptance.
Keep the landed route as infrastructure and absence evidence. B4B1R later tried
camera/proxy repair and was also rejected, so the next useful step is B4B1A0's
fair close grass test environment.

## Contract

Build the dedicated close grass workbench and prove the camera/review scale. This
slice owns **the lab route and crop scale only**.

Out of scope: changing grass body representation, atlas art, colour, LOD,
camera-relative generation, cliffs, water, sky, fog, full-scene terrain
silhouette, and final `battle-map-reference` camera composition.

## Approach

- Add a focused route/scene such as
  `/renderer/battle-grass-field?mode=foreground-close-lab` or a repo-equivalent
  first-class renderer-lab route.
- Use a small rolling terrain patch with the same terrain-normal and slope-mask
  contracts as production grass.
- Freeze neutral grass palette, overcast lighting, meadow/root base, generated
  atlas content, deterministic seed, and known rejected primitive families.
- Match the target close-hero crop scale: the camera should be close enough that
  the red B4A crop is a fair comparison.
- Define three lab-owned review windows from this same fixed camera:
  close-hero, transition, and mid-mass. B4B1 only proves those windows are fair;
  it does not tune LOD or make the midground visually accepted.
- Treat B4A's orange/blue crops as context only. This lab must define its own
  clean transition and mid-mass review windows before later LOD slices use those
  variables as gates.
- Capture the existing rejected families from this same camera before inventing a
  new body representation.
- Do not add camera-relative procedural generation here. Use a fixed small terrain
  patch so the close body problem is isolated before B4C makes it follow the
  viewer.

## Accept / Reject

Accept if the lab shot and crop make the close grass question fair: a future pass
can judge visible foreground grass body/strand scale without needing cliffs, fog,
water, or the full reference vista.

Reject if the lab still reads like a wide vista crop, if it depends on changing
palette/fog/terrain/camera composition, or if it begins tuning body density or
strand shape before the review scale is locked.

## Verification

- Archive the lab full shot, target close-hero crop, lab close crop, 2x/4x tight
  crops, route stats JSON, and rejected-family contact sheet under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/`.
- Stats/evidence should name the camera profile, crop ratios, approximate
  foreground world-units-per-pixel, and the close/transition/mid window labels.
- Use `compare-screenshots` against the target close-hero crop for scale
  comparability only, not visual parity.
- Run unprimed `screenshot-critique` scoped to: "Is this the right close camera
  scale for judging the target foreground grass?"
- Open the review-worthy shots with `preview-shots` as a non-blocking checkpoint.
- Keep the focused scene, `renderer-lab-routes`, and `tsc --noEmit` green.

## Result / Learning

Landed evidence is under
`assets/03b4-evidence/03b4c5-close-foreground-lab/lab-route/`. The default lab
published `1554` field records, `1343` field-fiber-shell tufts, `10744`
submitted triangles, field-owned meadow/root material, and the fixed camera
`{x:0,y:-36,zoom:104,pitch:0.78,yaw:-0.08}`. The snapshots and route checks are
green, so the lab is a useful reproducible surface.

Acceptance failed. The target close crop is `760x180`; the lab close crop is
`815x182`, center-cropped only for metrics. `compare-screenshots` reports
`parityDistance=0.25805` and `edgeEnergyRatio=0.13997`, proving the lab still has
far less close foreground structure than the target. The unprimed
`screenshot-critique` verdict was **unfair scale**, citing flat green ground,
missing close blade/body depth, weak perspective, uniform lighting, blur/smear,
artifact-like strokes, and transition/mid crops that do not yet help judge grass
quality.

Treat this slice as route/evidence landed but visual scale rejected. The follow-up
B4B1R camera/proxy repair also failed; the failure should now be read as "missing
foreground body," not as a reason to keep tuning camera windows.

## Next Slice

Continue with `03b4c5b4b1a0-close-grass-test-environment.md`.
