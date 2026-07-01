# Slice 03B4C5B4E - grass-only reference crop compose

## Contract

Bring the accepted close grass representation, camera-relative generation, and
depth LOD relationship back into `battle-map-reference`, but judge **only grass
crops/masks**.

The full shot must be archived for context, but it must not accept or reject this
slice on cliffs, water, sky, fog, terrain silhouette, or whole-frame parity.

## Approach

- Reuse the accepted B4B1A0 lab contract, B4B1A1R body technique, B4B1A2 perf
  envelope, B4B2-B4B5 body/strand/clump/palette stack, B4C0 backend policy,
  B4C1-B4C3 camera-relative and surface-response stack, and B4D1-B4D4
  LOD/falloff stack without inventing another representation.
- Expose the active profile/domain/LOD names in `BattleGrassStats` and route
  telemetry.
- If the reference camera still cannot show a close foreground comparable to the
  target, record that as a camera/composition blocker for a later camera or
  compose reslice rather than compensating with grass constants.

## Accept / Reject

Accept if the reference route's grass-only crops preserve the close-lab read:
close foreground body appears where the target has close grass, transition detail
collapses smoothly, and midground becomes soft meadow mass without readable
strands.

Reject if the accepted lab result collapses back into invisible grit, sparse
stamps, straw sheets, or full-frame-only improvement, or if acceptance requires
changing cliffs, water, sky, fog, terrain, meadow/root material, or camera.

## Verification

- Capture `battle-map-reference-primitive-family` and `battle-map-reference`.
- Archive full shots, grass masks/crops, route stats, and comparison artifacts
  under `assets/03b4-evidence/03b4c5-close-foreground-lab/reference-compose/`.
- Use `compare-screenshots` on close hero, transition, and mid-mass grass crops.
- Run unprimed `screenshot-critique` scoped to the near-to-mass grass
  relationship only.
- Open the review-worthy shots with `preview-shots`.

## Next Slice

If grass-only compose is accepted, continue with
`03b4c5c-atlas-tile-content-and-color-integration.md` only for atlas/color polish
that remains visible after the close and LOD contracts are true.
