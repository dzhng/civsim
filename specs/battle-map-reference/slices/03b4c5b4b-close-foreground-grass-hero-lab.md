# Slice 03B4C5B4B - close foreground grass hero lab

## Status

Resliced on 2026-07-01. Do **not** implement this as one wide "solve close
grass" pass. It is now the parent memo for the close-grass lab ladder:

1. `03b4c5b4b1-close-foreground-grass-lab-route.md` - route/evidence surface;
   landed but scale was rejected.
1r. `03b4c5b4b1r-close-lab-scale-and-perspective-repair.md` - repair the review
    camera, perspective cues, and close/transition/mid crop scale; attempted and
    rejected because camera/proxy-only work cannot make the body-less crop fair.
1a. `03b4c5b4b1a-close-body-technique-spike.md` - parent memo only; resliced
    into the following fixed-lab ladder.
1a0. `03b4c5b4b1a0-close-grass-test-environment.md` - prove the close grass lab
     camera/crop surface and absence baselines.
1a1. `03b4c5b4b1a1-close-body-architecture-matrix.md` - compare close-body
     architectures inside the accepted lab and choose the least-wrong candidate.
1a2. `03b4c5b4b1a2-close-body-perf-envelope.md` - record the selected body's
     density/perf envelope before coverage tuning.
2. `03b4c5b4b2-close-body-coverage.md` - solve dense soft body coverage and
   exposed-ground ratio.
3. `03b4c5b4b3-close-strand-scale.md` - solve visible close strand size and
   direction.
4. `03b4c5b4b4-clump-softness-height-variation.md` - solve clump envelope and
   height rhythm.

If any of those slices starts changing another visual variable, stop and reslice
with `feature-slicing` before editing more renderer code.

## Contract

Parent the close grass-only workbench ladder that can nail the reference
foreground scale before the grass is judged inside the full vista. The child
slices own the test surface, body architecture, coverage, strand scale, and clump
rhythm one variable at a time.

Out of scope: cliffs, water, sky, distance fog, full-scene terrain silhouette,
final camera composition, midground LOD, atlas colour polish, and performance
adoption.

## Approach

Add a focused route/scene such as:

- `/renderer/battle-grass-field?mode=foreground-body`, or
- `/renderer/battle-terrain-3d?gate=highland-valley&view=grass-close`.

The lab should:

- use a small rolling terrain patch with the same terrain-normal and slope-mask
  contracts as the production field;
- keep the current neutral grass palette, overcast lighting preset, meadow/root
  base, generated atlas, and deterministic seed unless this slice explicitly
  says otherwise;
- show the camera close enough that the target close hero crop is the right
  comparison scale;
- include fixed close, transition, and mid-mass review windows so later B4D
  slices can prove "visible near, collapsed mid/background" without returning to
  the full vista early;
- capture a contact sheet of existing rejected families (`field-fiber-shell`,
  `texture-volume`, `texture-carrier`, `texture-micro-carrier`) before adding a
  new body representation.

B4B1R did not prove the scale: the latest critique says the lab remains an unfair
comparison because foreground grass body is missing. B4B1A0 should first prove a
fair close test surface. B4B1A1 can then compare body representations in that
fixed environment, such as a texture-backed body carpet, denser alpha-impostor
volume, multi-plane tuft sheets, or a typed body profile. Keep height/body
envelope, alpha/coverage response, seating, strand scale, and clump rhythm in
their own child slices.

## Accept / Reject

Accept this parent only when the child ladder exists and the README points at the
current live child. Individual visual acceptance belongs to B4B1A0, B4B1A1,
B4B1A2, B4B2, B4B3, and B4B4.

Reject implementation passes that try to solve test surface, body architecture,
coverage, strand scale, clump rhythm, and camera-relative behavior together.

## Verification

- Add a browser scene such as `battle-map-reference-grass-close-lab`.
- Archive the lab full shot, contact sheet, close hero crop, 2x tight crops, route
  stats JSON, and comparison artifacts under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/`.
- Use `compare-screenshots` against the target close hero crop and against the
  rejected field-shell/B3 micro baseline crop.
- Run unprimed `screenshot-critique` scoped only to close foreground grass body,
  strand/clump scale, primitive legibility, exposed ground, and card/speckle
  artifacts.
- Keep `renderer-lab-routes`, the focused lab scene, `battle-grass-field`, and
  `tsc --noEmit` green.
- Open review-worthy shots with `preview-shots` as a non-blocking checkpoint.

## Next Slice

Continue with `03b4c5b4b1a0-close-grass-test-environment.md`; B4B1R is recorded
as rejected evidence.
