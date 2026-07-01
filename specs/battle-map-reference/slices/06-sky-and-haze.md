# Slice 06A — overcast sky plate

## Contract

Add the reference's high-key overcast sky plate: pale grey-white horizon, cooler
upper sky, and very soft cloud mass. This slice is sky only.

## Fixed Inputs

- Do not change world fog, grass, terrain, cliffs, water, or weather presets.
- The sky pass is a background-underpaint phase and must not fake world geometry.

## Accept / Reject

Use `compare-screenshots` on a sky-only crop. Judge:

- top-to-horizon luminance gradient;
- cloud softness and low contrast;
- absence of hard seams or decorative blobs.

Wrong cliff silhouette, missing distance fog, or water placement are out of scope.

## Verification

- Route stats publish the active sky pass.
- Render graph remains `background -> world-depth -> overlay`.
- Existing battle snapshots that include sky are re-blessed deliberately.
- Run the neutral review/screenshot critique with a prompt scoped to sky gradient
  and cloud softness only.

## Next Slice

After the sky plate is accepted, freeze it and tune world distance fog in
`06b-distance-fog.md`.
