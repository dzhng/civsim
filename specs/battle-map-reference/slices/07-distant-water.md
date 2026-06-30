# Slice 07A — distant water placement and silhouette

## Contract

Place the reference's pale water inlet in the right mid-distance with the correct
screen relationship to the foreground hummock and far ridges. This slice is
placement and silhouette only.

## Fixed Inputs

- Grass, terrain, cliffs, sky, and distance fog are frozen.
- Do not tune water colour, shore material, foam, or haze integration except enough
  neutral flat colour to see the silhouette.

## Accept / Reject

Use `compare-screenshots` on a right-midground water mask/crop. Judge:

- water occupies the right mid-distance, not the foreground or horizon edge;
- silhouette width and curve are close to the target;
- terrain partly occludes the inlet like the reference.

Do not reject this slice for wrong water colour, hard shore, or fog mismatch.

## Verification

- Route stats publish water placement/mask information.
- `edgeSealMismatches` stays empty; water placement must not lie about passability.
- The water crop/mask artifact is committed.
- Run the neutral review/screenshot critique with a prompt scoped to water placement
  and silhouette only.

## Next Slice

After placement is accepted, freeze the water shape and tune material/shore in
`07b-water-material.md`.
