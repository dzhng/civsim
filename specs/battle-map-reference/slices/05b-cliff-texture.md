# Slice 05B — cliff face texture and pale streaks

## Contract

With cliff geometry frozen, make the ridge faces read like the reference: grey rock
planes with vertical pale streaks, broken faces, and soft value variation.

## Fixed Inputs

- Freeze the accepted Slice 05A ridge silhouette and depth rows.
- Do not move the cliff, add rows, change fog, change sky, alter grass, or tune water.

## Accept / Reject

Use `compare-screenshots` on the same cliff crop/mask as Slice 05A. Judge:

- vertical streak direction and density;
- rock value range;
- face breakup without returning to cone/pyramid silhouettes.

Wrong fog depth, water, or foreground grass are out of scope.

## Verification

- Cliff texture crop artifacts record edge energy and luminance range versus target.
- Backdrop geometry stats are unchanged except for material/texture fields.
- Run the neutral review/screenshot critique with a prompt scoped to cliff face
  texture and pale streaks only.
- `battle-terrain-blockers` and render-graph checks stay green.
