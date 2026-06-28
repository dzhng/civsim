# Ambient Campaign Life

## Contract

The campaign map should feel alive without compromising strategic readability.
Important roads may show moving carts, trade traffic, patrol markers, or similar
small animated props that follow road splines and respect fog and LoD.

## Human Check

Central Italy and close Rome should show subtle movement on key roads when
zoomed in enough. The animation must not distract from army/city markers or
make roads harder to read.

## Verification

- Add an ambient-life scene with deterministic animation time.
- Add path-following probes proving carts stay on road splines.
- Add fog and LoD checks so hidden or too-distant traffic disappears.
- Store captures or short clips under `visualizations/campaign-life/`.

## Done

- At least one ambient road-life prop moves on road geometry.
- Props stay aligned to roads and terrain while the camera moves.
- Props obey fog and LoD visibility rules.
