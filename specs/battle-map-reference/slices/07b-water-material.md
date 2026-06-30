# Slice 07B — water material, shore softness, and haze integration

## Contract

With water placement frozen, tune the inlet material so it reads as pale, distant,
neutral turquoise water under overcast light, with a soft shore and distance haze.

## Fixed Inputs

- Freeze the accepted Slice 07A water silhouette.
- Do not move the water, cliffs, terrain, grass, sky, or fog curves.

## Accept / Reject

Use `compare-screenshots` on the accepted water crop. Judge:

- water hue/value against the target;
- shore softness and absence of a bright hard seam;
- distance-haze integration with surrounding terrain.

Wrong water placement belongs back to Slice 07A; wrong fog curve belongs back to
Slice 06B.

## Verification

- Water material stats identify the active material/preset path.
- Water crop metrics record average colour and edge energy versus target.
- Run the neutral review/screenshot critique with a prompt scoped to water material,
  shore softness, and haze integration only.
- Coastline/edge-seal scenes stay green.
