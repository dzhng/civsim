# User Feedback Images — the requirement

The four screenshots in this folder are the concrete standard campaign polish was
held to: real in-game captures the user supplied (copied from clipboard
attachments so the spec never depended on temporary `/var` paths). Each one named
a defect on the live WebGPU campaign map; together they defined what "done" had to
fix. The accepted results that answer them live in `../acceptance/` and are walked
through in the spec's [README](../../README.md#visual-provenance).

## What each image showed

- `01-rome-ostia-label-road.png` — the bottom-left coastal city near Rome,
  Ostia/Portus, was at risk of losing its label and its road.
- `02-city-label-distance-tibur.png` — city labels floated far from their city
  icon/model (the target margin was about one label/icon height).
- `03-mountains-roads-trees.png` — the ground read brown rather than green;
  mountains were chunky and crowded cities/roads/labels; a city sat inside the
  mountain mass (a clearance and terrain-authoring failure); trees/forests were
  absent; no road-life carts.
- `04-rome-south-road-cutoff.png` — the road leaving Rome toward the south was cut
  off before it reached the next city.
