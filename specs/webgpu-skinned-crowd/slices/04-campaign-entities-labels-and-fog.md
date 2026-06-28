# Campaign Entities Labels And Fog

## Contract

Campaign entities preserve the old renderer's readability while obeying the
WebGPU 3D depth model. Labels, icons, flags, selection rings, shadows, fog, and
city/army colocation must all be playable at the camera level where they appear.

## Human Check

Close Rome should show the city flag emerging from the city volume, army labels
not colliding with Roma, readable white outlined text, correct icon spacing,
selection ring on the ground, and no trees or scenery floating over nearer
flags. Fog views must not show flags, markers, or labels for hidden content.

## Verification

- Add close crops for city flag nesting, army flag direction/height, selection
  rings, shadows, and label spacing.
- Add a garrison/colocation capture that renders one combined label: army name
  and size on top, city name below.
- Add fog captures proving hidden flags and markers are not rendered.
- Store captures under `visualizations/campaign-entities/`.

## Done

- Labels match the previous text/icon style and zoom density rules.
- Fog hides hidden markers, flags, and labels while keeping the zoomed-out
  border-fog effect.
- Selection rings are perspective ground geometry and remain outside shadows.
- Nested objects rely on depth, not manual draw-order exceptions.
