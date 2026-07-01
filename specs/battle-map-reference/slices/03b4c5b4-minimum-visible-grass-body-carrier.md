# Slice 03B4C5B4 - minimum visible grass-body carrier

## Status

Resliced on 2026-07-01 after David's camera-scale feedback. Do **not** implement
this as a single full-reference-camera body-carrier pass.

The previous B4 plan still asked the current wide `battle-map-reference` vista to
prove close foreground grass. That was the wrong review surface. In the target,
the lower foreground is close enough that grass body and some strand direction are
visible; the midground/background collapse into soft meadow mass without readable
individual strands. Our current shot is too zoomed out for that first question,
so continuing to tune micro cards in the full vista would keep conflating camera
scale, foreground representation, procedural generation, and LOD falloff.

Current architecture answer: the route is **partly camera-aware but not
false-earth-style camera-procedural**. It builds stable CPU field records from the
terrain, then selects/fades records through a camera focus/depth window. It does
not yet generate or recycle grass from a camera-relative near/mid/far domain with
stable snapped cells/rings, terrain-normal attributes, churn telemetry, and LOD
bands around the viewer.

## Replacement Ladder

Implement these in order:

1. `03b4c5b4a-foreground-grass-scale-and-crop-contract.md`
   - no renderer edits;
   - fix the current crop board before handoff: red close-hero is usable, orange
     transition is too loose, and blue mid-mass is rejected as cliff/fog/sky
     contamination;
   - prove the next visual work has the right judging zones.
2. `03b4c5b4b1-close-foreground-grass-lab-route.md`
   - build the close grass-only workbench and prove the camera/review scale.
3. `03b4c5b4b1r-close-lab-scale-and-perspective-repair.md`
   - repair the rejected lab camera/crop scale without changing grass art.
4. `03b4c5b4b1a-close-body-technique-spike.md`
   - parent/reslice memo only; do not implement as one combined pass.
5. `03b4c5b4b1a0-close-grass-test-environment.md`
   - prove the fair fixed close lab and absence baselines before technique work.
6. `03b4c5b4b1a1-close-body-architecture-matrix.md`
   - choose the least-wrong close body representation in the accepted lab.
7. `03b4c5b4b1a2-close-body-perf-envelope.md`
   - record its local density/perf envelope without deciding CPU versus GPU
     generation.
8. `03b4c5b4b2-close-body-coverage.md`
   - solve dense soft body coverage and exposed-ground ratio.
9. `03b4c5b4b3-close-strand-scale.md`
   - solve visible close strand size and direction.
10. `03b4c5b4b4-clump-softness-height-variation.md`
   - solve clump envelope and height rhythm.
11. `03b4c5b4b5-close-palette-and-atlas-lock.md`
   - lock close-lab palette, atlas opacity, and tile integration without
     changing density or body shape.
12. `03b4c5b4c0-camera-relative-backend-spike.md`
   - prove the camera-relative backend seam and perf gates; camera-position
     procedural is the domain, GPU-native is only an optional backend.
13. `03b4c5b4c1-camera-relative-field-domain.md`
   - introduce CPU-first snapped cells/rings, stable origins, and churn
     telemetry around the camera.
14. `03b4c5b4c2-terrain-normal-slope-eligibility.md`
   - prove terrain-normal attributes and slope/water/tint rejection for emitted
     records.
15. `03b4c5b4c3-surface-tilt-tip-blend.md`
   - prove bases hug terrain while tips recover upward through height-based
     blending.
16. `03b4c5b4d1-lod-band-contract.md`
   - define near/transition/mid/far ownership bands and telemetry before tuning.
17. `03b4c5b4d2-near-to-transition-collapse.md`
   - fade readable close strands into clumped soft body in the transition crop.
18. `03b4c5b4d3-mid-mass-continuity.md`
   - make midground meadow mass continuous without readable primitives.
19. `03b4c5b4d4-depth-falloff-sequence.md`
   - verify close, transition, and mid-mass crops as one depth sequence.
20. `03b4c5b4e-grass-only-reference-crop-compose.md`
   - bring the accepted grass stack back into `battle-map-reference`;
   - judge only the grass crops/masks, not cliffs, fog, water, sky, or whole-frame
     parity.

Only after this ladder should 03B4C5C reference-route atlas polish and 03B4C5D
midground polish resume. If the CPU camera-relative field and accepted body
representation are visually right but too expensive, record the cost and hand off
to 03B5/03B6 rather than hiding the tradeoff inside full-vista tuning.

## Firewalls

- Do not change the production/reference camera to make grass look closer inside
  this slice. If the final composition truly needs a closer foreground camera,
  reslice camera/composition explicitly before changing grass.
- Do not accept any 03B4C5 pass from full-frame improvement alone. The close
  foreground crop must first read as soft, clumped grass body.
- Do not move to atlas content, colour, fog, terrain, meadow/root material, water,
  cliffs, or sky until the owning slice says that variable is active.
- Do not port false-earth GPU compute, Three.js/TSL, indirect draws, or character
  interaction as a separate grass technique. B4C0/03B6 may use GPU only as a
  backend behind the same camera-relative record seam.

## Next Slice

B4A, B4B1, and B4B1R are historical evidence now. The live pickup is
`03b4c5b4b1a0-close-grass-test-environment.md`.
