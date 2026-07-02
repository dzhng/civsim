# Slice 12a Sea Technique Spike

## Built

- Added one swappable battle sea displacement seam in `packages/photoreal-renderer/src/battle/seaLayer.ts`.
- Added `?sea=gerstner|ifft` on `/renderer/photoreal-battle`.
- Published active sea identity in stats as `renderStats.sea` and `renderStats.terrain.sea`.
- Added `web/scenes/battle/photoreal-sea-spike.mjs`:
  - asserts Gerstner source identity;
  - asserts requested IFFT source identity, or Gerstner fallback tier under SwiftShader;
  - checks a non-blank lower sea band;
  - checks fixed-`setTime` byte determinism for Gerstner;
  - writes local review shots to `web/shots-spike/`.

## Technique Notes

### `gerstner-tsl`

The Gerstner prong ports the tuned `packages/game-renderer/src/water/gerstnerField.ts`
wave spectrum faithfully: same baked wave list, same phase rule, same sharpened
crest profile, same analytic normal, and the same owned `uTime` uniform from
`PhotorealWorld.setTime`.

### `ifft-tsl`

The IFFT prong is a spike-grade spectral reconstruction behind the same seam:
three cascades, advertised 256 resolution, deterministic JONSWAP-weighted modes,
displacement, analytic normal, and a crest/Jacobian-derived foam signal.

Approximation versus the real Spiri0 technique: this does not yet retain GPU
storage textures or run TSL compute butterfly passes. A complete port would add
JONSWAP spectrum initialization, ping-pong butterfly textures, displacement,
normal, and Jacobian storage textures, then sample those textures from the sea
material. The current implementation keeps the route/stats/fallback seam in
place so the reviewer can judge whether the IFFT look is worth carrying into a
full compute texture port.

## Limitations

- IFFT is intentionally disabled on software adapters; requesting `?sea=ifft`
  under SwiftShader reports `requested:'ifft-tsl'`, `source:'gerstner-tsl'`,
  `tier:'gerstner-tsl-swiftshader-fallback'`.
- Surface shading is still the pre-12b standard-material scaffold. Fresnel sky
  reflection, disciplined glint, full foam, and shore turbidity remain in 12b-12e.
- Review shots are local spike artifacts under `web/shots-spike/`, not blessed
  screenshot baselines.

## Run Commands

```sh
bun run --cwd web typecheck
bun run --cwd web test:unit
node --check web/scenes/battle/photoreal-sea-spike.mjs
```

Start the dev server:

```sh
bun run --cwd web dev
```

Run Gerstner in the browser:

```text
http://localhost:5173/renderer/photoreal-battle?map=A&ref=1&t=18.25&sea=gerstner&zoom=8.2&cx=520&cy=-180&pitch=0.28&yaw=-1.5707963267948966
```

Run the IFFT spike in the browser:

```text
http://localhost:5173/renderer/photoreal-battle?map=A&ref=1&t=18.25&sea=ifft&zoom=8.2&cx=520&cy=-180&pitch=0.28&yaw=-1.5707963267948966
```

Run the spike scene under SwiftShader:

```sh
cd web
VERIFY_GPU=1 node scene.mjs photoreal-sea-spike
```
