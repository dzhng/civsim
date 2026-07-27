# 07 — Wind motion on grass  ●── JOIN: windSignal ──●

**Track:** grass (on spike winner) · **Variable:** motion · **Gate:** write-vibe GIF
(motion can't be judged in one frame) · **Join point with audio `23`.**

## Contract
A convincing wind *feel* — coherent gust fronts sweeping across the field with
upwind lag and a sheen-flash — replacing today's single
`sin(phase + time*0.82 + …)` tip-sway. The grass reads the **same `windSignal` the
audio reads**, so eye and ear gust together.

## API seam
The winning grass material's wind block consumes `windSignal`'s GPU uniforms
(`windDir`, `windSpeed`, `gust`, `windProfile(height)`) — **authored CPU-side from
`setTime`**, never the banned `time` node. Removes the inline wind constants from
`bladeFieldLayer.ts` (the source of truth is now `01`). Taller blades feel more wind
(`windProfile`); gust fronts add excitation + ringing + the pale sheen flash.

## Verification
- **write-vibe** time-series GIF: a gust reads as a *band racing across the field*,
  not per-blade jitter; the sheen band appears on the gust. screenshot-critique on
  representative frames.
- Static snapshots at fixed `?t=` stay **byte-stable** (determinism — the whole
  reason `01` exists).

## Must stay green
Every fixed-`?t=` grass baseline (determinism); the FPS loose floor.

## Delegated
Analytic gust-band uniform (recommended, cheaper) **vs** a full 256px wind
render-target (the pen's approach). **Reslice hook (R2):** if the analytic uniform
doesn't sell the sweep, reslice to the RT; if the RT stalls in TSL, the analytic
bands are the shippable fallback — the *sweep feel* is the deliverable, the RT is
one way to get it. Blade ringing frequency; upwind lag distance.

## Landed (2026-07-27)

windSignal GPU surface gained bandVelocity/bandFrequency/bandSharpness; the
blade shader evaluates the travelling front per blade world-position (64 m
crest-to-crest, trough 0.3x / crest 1.8x sway modulation, sheen riding the
crest only); windProfile(height) scales sway; the old inline sin() constants
are DELETED — windSignal is the sole owner. CPU mirror + tests updated.

Gate history: v1 read as synchronized per-blade glitter (diff heatmap showed
no macro band — wavelength/contrast/per-blade evaluation all implicated);
fix round landed the explicit front. v2 heatmap (assets/07-wind-evidence/)
shows coherent perspective-compressed crest stripes; fixed-t captures stay
byte-deterministic (t=4 twice identical). Vibe GIF: assets/07-wind-vibe.gif.
