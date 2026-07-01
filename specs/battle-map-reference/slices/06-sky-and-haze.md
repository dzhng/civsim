# Slice 06 — sky, haze & weather (swappable environment lighting)

## Contract unlocked

The high-key envelope that dominates the reference **and** the mechanism that makes
the warm-vs-cold question a *weather setting*, not a repaint: a real sky, a shared
aerial-perspective fade, and a **swappable weather preset** (sun + sky + fill + fog)
over the neutral materials. The map renders as the **overcast-foggy** reference *or* a
**golden-hour** Aegean field by swapping the preset, with no material edits.

**This is also the cheapest test we have:** because the `overcast-foggy` preset
targets the reference photo directly, acceptance is a plain `compare-screenshots` of
our overcast render against `assets/target-battle-map.png` — **the reference image *is*
the baseline**, nothing extra to author or maintain.

## API seam

One owned struct, three consumers, two shipped presets:

- **`EnvironmentPreset`** owned in `web/src/battle/renderer.ts`:
  `{ sunColor, sunElevation, sunAzimuth, skyTop, skyHorizon, fillColor, fogColor,
  fogStart, fogDensity }`. Ship **two**: `overcast-foggy` (flat cool high-key sky,
  low sun contrast, deep pale fog — the reference / this map's default) and
  `golden-hour` (low warm sun, gold-to-blue sky, warm key + cool fill, thinner warm
  haze — parity with the aesthetics `battle-*.jpg`).
- **Sky:** a graded **sky** background pass (new
  `packages/game-renderer/src/battle/skyPass.ts`, role `background-underpaint`)
  driven by `skyTop`/`skyHorizon`, replacing the flat clear in `renderer.ts`.
- **Light + fog into the world shaders:** extend
  `renderer-core/src/cameraWgsl.ts` (`WORLD_CAMERA_WGSL`) with a `civsimAerialFog(...)`
  helper and a key/fill term, fed by the preset uniform on the camera bind group, and
  applied in `groundPass`, `grassPass`, `sceneryPass`, and the `horizonPass` backdrop.
  **The existing baked `warmKey`/`coolFill` in `groundPass` move into the preset** —
  materials stop carrying their own light. Depth fade becomes consistent across passes
  (today each hazes ad hoc).
- **Optional zoom-reactive haze:** let `fogDensity` lift with the Slice 01 `zoomT` so
  the deep mist reads at full zoom-in and thins toward top-down. Same `zoomT` seam the
  grass uses.

> **Risk note:** highest-leverage *and* highest-touch slice — it edits the shared
> camera shader every world pass includes and moves the baked grade out of
> `groundPass`, so *every* existing battle snapshot moves. Expected; bless deliberately
> (below), don't blanket-overwrite. Pick one preset as the existing maps' default so
> their re-bless is a single intentional shift.

## What the human can run / see

`renderer/battle-environment?gate=<map>&preset=<overcast-foggy|golden-hour>` — the
**same map under both presets, side by side**: overcast should land on the reference,
golden-hour should read as a sun-drenched Aegean field, from one set of albedos.

## Verification

- **The both-presets proof (this slice's whole point):** capture `highland-valley`
  (and one existing map) under each preset; `overcast-foggy` matches
  `assets/target-battle-map.png`, `golden-hour` matches the aesthetics `battle-*.jpg`
  register — **same albedos, only the preset differs**. Diff that the material base
  colors are byte-identical between the two captures (light is the only variable).
- Pixel metric: sky hue top vs. horizon; far-vs-near contrast drop proving aerial
  perspective; no hard seam where mountains meet sky.
- `ctx.check`: the active `EnvironmentPreset` is published in stats.
- Render-graph phase order still valid (`background` → `world` → `overlay`).
- **Every existing battle snapshot re-captured and deliberately re-blessed via a
  `change-report`** under the chosen default preset.

## Screenshot-critique

**Required — this slice most needs the unprimed eye.** Two shots: does
`overcast-foggy` read as the reference's cool misty recession, *and* does
`golden-hour` read as warm Aegean — without either looking like a hue filter slapped
on the other? Units legible at play zoom under both.

## Must stay green

After the deliberate re-bless: `battle-renderer-visual`, `battle-terrain-3d`,
`battle-terrain-elevation`, `battle-terrain-blockers`. Sim untouched. Verify the
shared frame-shell/camera change doesn't unintentionally alter the campaign sky/haze
(or re-bless intentionally).

## Human feedback that would reshape this slice

How many presets (just these two, or also flat-midday / dawn); which is each map's
default; sun elevation/azimuth and fog curves per preset; whether presets are
per-map, per-scenario, or player-selectable.
