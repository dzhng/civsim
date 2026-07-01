# Slice 10 — Physical sky + atmosphere (ONE aerial owner)

## Contract unlocked

The high-key Aegean light (aesthetics rules 1–2): a physical sky that the sun, the
IBL, and the haze all agree with — and the **single atmosphere owner** the README
invariants demand. Battle's four historical inline haze copies (frameShell terrain /
`groundPass` / `horizonPass` / water WGSL) are already orphaned for battle by `08b`;
this slice ensures their photoreal replacement is ONE source, not a fifth copy.

## API seam

**10a — physical sky.** `packages/photoreal-renderer/src/battle/skyLayer.ts` behind a
`SkyModel` seam: primary = **Hillaire-style sky** (transmittance + sky-view LUTs in
TSL compute); fallback = three's `SkyMesh` addon / analytic TSL dome (budget a
half-day replication spike — 06 flagged addon usability outside the examples repo as
poor). Sun disc; sun `DirectionalLight` direction/color derived from the same
parameters. The sky **feeds `scene.environment`** (small equirect RT → PMREM), which
**deletes the procedural equirect stand-in** from `07`/`09` — ambient always agrees
with the visible sky. Never two sky paths outside the `SkyModel` seam.

**10b — aerial perspective, the ONE owner.**
`packages/photoreal-renderer/src/atmosphere/aerialPerspective.ts` — one TSL
scatter/extinction function (aerial LUT or analytic Hillaire fit) applied through a
shared material hook to *every* world surface (terrain/sea/foliage/crowd/scenery).
**Deletes the parity `THREE.Fog` stand-in from `08a`.** No material adds its own haze,
ever — this is the register-maker (aesthetics rule 1) and the net-deletion invariant.

**10c — presets through the sky model.** `golden` / `dusk` / `overcast` mapped through
the physical parameterization (sun elevation + turbidity drive everything); fields
added to `CIVSIM_ENVIRONMENTS`, per the `09` rule.

## What the human can run / see

`/battle` under each preset; `/renderer/photoreal-battle?env=…`.

## Verification

- One visual variable per sub-slice: **10a crop `sky-band`** (top third of the vista
  framing, sky/sea meeting strip); **10b crop `far-terrain-band`** (distant ridge
  haze); **10c full-frame per preset**. Out of scope: sea material (`12`), terrain
  detail (`13`), shadows (`11`).
- NEW scene `web/scenes/battle/photoreal-sky.mjs`: 3 presets at fixed `setTime`,
  named crops.
- `compare-screenshots` vs `battle-coastal-vista.jpg` (golden sky band) and
  `battle-overcast-highland.png` (overcast — same materials, different environment:
  the aesthetics litmus). `screenshot-critique` last on every shot.
- **SwiftShader capability fallback proven by the scene:** sky-LUT compute is a
  flagged SwiftShader risk — the fallback is adapter-gated *inside* the `SkyModel`
  seam, the SwiftShader run must render non-blank, and the stats identity fields
  assert **which tier ran**. Hardware runs the full tier.
- Standing gates: perf gate + ledger entry, seating tripwire, campaign byte-identical,
  unit test for deterministic preset→sun/haze mapping.

## Must stay green

Standing gates 08b→17. Grep-proof after 10b: exactly one aerial/haze source in
`packages/photoreal-renderer` (the campaign/bespoke haze copies live until `16`/`17`
and are recorded in the README scaffolding ledger).

## Research

- Hillaire, *A Scalable and Production Ready Sky and Atmosphere Rendering Technique*
  (EGSR 2020) + <https://github.com/sebh/UnrealEngineSkyAtmosphere>.
- <https://github.com/JolifantoBambla/webgpu-sky-atmosphere> (raw-WebGPU LUT layout —
  replication reference).
- three `webgpu_sky` example (`SkyMesh`, Preetham — decide analytic-vs-LUT in the
  spike); `webgpu_custom_fog` / TSL fog nodes; `webgpu_tsl_compute_*` examples.

## Human feedback that would change this slice

Preset mood tuning is explicitly David's knob (how hazy is overcast, how warm is
dusk). If the analytic dome already nails the register, the Hillaire LUT path can be
recorded as not-needed — decide on shots, not ambition.
