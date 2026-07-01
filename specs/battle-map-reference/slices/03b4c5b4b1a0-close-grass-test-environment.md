# Slice 03B4C5B4B1A0 - close grass test environment

## Contract

Build the fixed close foreground grass lab before choosing another grass body
technique. This slice owns **review surface comparability only**: camera, terrain
patch, crop windows, target/absence baselines, labels, and telemetry shape.

Out of scope: choosing a body primitive, coverage tuning, strand scale, clump
rhythm, atlas colour/content, camera-relative generation, CPU-vs-GPU backend
policy, LOD collapse, cliffs, water, sky, fog, terrain silhouette, and full
`battle-map-reference` compose.

## Current State

B4B1 and B4B1R proved useful route/crop infrastructure but not a fair close
grass comparison. The latest selected close profile is still smooth green ground
with missing body and weak depth progression. The wide `battle-map-reference`
camera is too far out for this discovery work: the reference has a near lower
foreground where grass body is visible, while mid/background grass should already
collapse into meadow mass.

The current route is **not** false-earth-style camera-position procedural grass.
It samples stable CPU field records and uses camera focus/depth to select/fade
records. That is allowed here because this slice is a fixed lab. Camera-relative
procedural cells/rings start later in B4C0/B4C1.

## Approach

- Start from B4A's red close-hero target crop and the B4B1/B4B1R absence
  evidence.
- Create or refine a dedicated close lab route/scene where the foreground fills
  the lower frame enough to judge grass body without relying on the final wide
  vista.
- Freeze terrain patch, camera profile, lighting, palette, meadow/root base,
  generated atlas seed, crop labels, and telemetry fields.
- Use the spec/aesthetics grass palette and existing grass colour constants.
  Do not introduce untracked generic greens; if colour or atlas art is the
  blocker, record it for the later atlas/colour slice instead of solving it here.
- Include three crop windows: close body target, transition context, and mid-mass
  context. Only the close body crop is an acceptance target in this slice.
- Include B4B1 and B4B1R as absence baselines so later candidates prove they add
  body rather than merely changing the camera.

## Accept / Reject

Accept if the route/contact sheet is a fair fixed surface for judging close grass
body: the crop scale is close enough to the target lower foreground, the absence
baselines are visible, stats are recorded, and the transition/mid windows are
present as context without becoming acceptance gates.

Reject if the slice tries to improve grass body, retints the scene, changes fog
or terrain to hide weak grass, compares against the final wide vista, or starts
camera-relative procedural generation.

## Verification

- Archive full lab shot, target/absence/candidate crop board, stats JSON, and a
  short comparability decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/test-environment/`.
- Use `compare-screenshots` against the target close-hero crop and the B4B1/B4B1R
  absence crops. Judge crop scale, foreground occupancy, and comparability only;
  do not judge body technique or final coverage.
- Run unprimed `screenshot-critique` scoped to: "Is this lab surface fair for
  judging close foreground grass body, and what comparability issue remains?"
- Open the contact sheet with `preview-shots` as a non-blocking checkpoint.
- Keep the focused lab scene, `battle-grass-field`, `renderer-lab-routes`, and
  `tsc --noEmit` green.

## Result (2026-07-01)

Accepted as a **review-surface slice only**, fair-with-caveats. The active
evidence lives under
`assets/03b4-evidence/03b4c5-close-foreground-lab/test-environment/`.

The B4B1A0 contact sheets now label the target close crop, B4B1 and B4B1R
absence baselines, selected B4B1A0 lab crop, close 2x/4x crops, transition
context, and mid-mass context. The fixed lab contract uses camera profile
`b4b1a0-test-env`, frozen terrain `battle-grass-field-slope-grid`, palette
`green-grass`, lighting `renderer-lab-overcast-clear`, seed `12722`, field-owned
meadow, and enabled root mass.

`compare-screenshots` against the normalized close-hero target recorded
`parityDistance=0.24936`, `avgLuminanceDelta=-1.57723`, and
`edgeEnergyRatio=0.11698`. That is acceptable for this slice's comparability
surface but explicitly not acceptable as grass body: the target has much denser
foreground structure than the current flat green lab crop.

The unprimed screenshot critique verdict was **fair-with-caveats**. It cleared
the lab as usable for the next candidate matrix, while calling out the same body
absence, perspective caveat, and need for explicit labels. Labels were added to
the active sheets before the final focused screenshot gate.

Final gates passed:

- `SNAP=foreground-close-lab-test-environment ... node scene.mjs battle-grass-field`
- `node scene.mjs renderer-lab-routes`
- `npx tsc --noEmit`
- `node --check web/scenes/battle/battle-grass-field.mjs`
- `node --check web/scenes/system/renderer-lab-routes.mjs`

## Next Slice

Continue with `03b4c5b4b1a1-close-body-architecture-matrix.md`.
