# Slice 07B — water material, shore softness, and haze integration

## Contract

With water placement frozen, tune the inlet material so it reads as pale, distant,
neutral turquoise water under overcast light, with a soft shore and distance haze.
This slice inherits the Slice 06B fog contract: the water material must use the
same environment `hazeColor` / `WATER_HAZE` family and final far-surface dissolve
proved by the water shots, not a second battlemap-only fog tint.

## Fixed Inputs

- Freeze the accepted Slice 07A water silhouette.
- Do not move the water, cliffs, terrain, grass, sky, or fog curves.
- Do not replace the Slice 06B haze contract. If the water needs stronger or
  weaker distance fade than the surrounding terrain, adjust only the water
  distance band while keeping the shared haze colour and blend semantics.

## Accept / Reject

Use `compare-screenshots` on the accepted water crop. Judge:

- water hue/value against the target;
- shore softness and absence of a bright hard seam;
- distance-haze integration with surrounding terrain.

Wrong water placement belongs back to Slice 07A; wrong fog curve belongs back to
Slice 06B.

## Verification

- Water material stats identify the active material/preset path.
- Stats identify the haze preset/range used by the water material and show it is
  tied to the shared environment haze colour.
- Water crop metrics record average colour and edge energy versus target.
- Run the neutral review/screenshot critique with a prompt scoped to water material,
  shore softness, and haze integration only.
- Coastline/edge-seal scenes stay green.
