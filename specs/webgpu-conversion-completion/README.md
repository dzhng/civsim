# WebGPU Conversion Completion

## Goal

Take the WebGPU renderer from "architecture shipped" to "release-cutover ready"
for the non-campaign surface. The
[foundation](../done/webgpu-skinned-crowd-foundation/README.md) closed the
architecture: frame graph, depth contract, GPU vertex skinning, instancing, and
both battle and campaign renderers run on WebGPU end to end. What remains is the
work that turns a sound skeleton into a shippable renderer:

1. **Core robustness** — the device/error layer is happy-path only. A single GPU
   reset or shader error silently kills the game.
2. **Soldier art pipeline** — every soldier is a procedural box placeholder
   driven by one global placeholder VAT. The path to import real rigged art does
   not exist yet.
3. **Battle fidelity** — soldiers cast no shadow and ignore terrain elevation;
   effects are flat line projectiles.
4. **Release gates** — the cutover/release audit harness is built and correct,
   but every gate is blocked because its input report has never been generated.

This spec was scoped from a multi-agent gap review of the closed foundation
(2026-06-29): 46 verified gaps. Campaign gaps were routed to
[campaign-polish](../campaign-polish/README.md), not here.

## Non-Goals

- **Minimap stays 2D.** The WebGPU `BattleMinimapPass` is intentionally left
  unwired. We keep the 2D canvas renderer up to date as the debug + minimap
  surface. Do not wire `minimapPass.ts` into production.
- **No WebGL fallback renderer.** WebGPU-only is a deliberate choice.
  Unsupported browsers keep the existing clear menu error
  (`web/src/main.ts`, `web/src/menu/scene.ts`), not a fallback renderer.
- **Campaign visuals live in [campaign-polish](../campaign-polish/README.md).**
  Brown terrain, mountain clearance, trees, road-life carts, label/road
  readability are owned by that spec's slices 02–05. This spec does not touch
  the campaign renderer.
- **Real artist assets are not a precondition.** We build the importer + bake
  toolchain and a replacement contract; procedural placeholders remain the
  shipping default until real `.glb` art is dropped in.

## Sacred Contracts (do not break)

- **One world/camera/depth contract** shared by battle and campaign
  (`packages/webgpu-core/src/depthContract.ts`, `cameraUniform.ts`,
  `cameraWgsl.ts`). New passes declare semantic roles; they do not hand-sort
  type buckets.
- **VAT layout** (`packages/webgpu-core/src/vatLayout.ts`,
  `packages/soldier-assets/src/schema.ts`) is the skinning interchange format.
  Real assets must bake *into* this format, not replace it.
- **Frame graph / pipeline contracts** (`frameGraphContract.ts`,
  `pipelineContracts.ts`, `renderGraph.ts`) own pass ordering and role
  declarations.
- **The sim is untouched.** This is renderer-only work. `crates/**` and battle
  balance stay green; no soldier-look change may alter `pick_unit` hit testing
  or sim-driven positions.

## Slice Graph

Three groups, built roughly in order. Group A is small, high-value, and
protects every route, so it lands first. Group B is the headline fidelity work
and the largest. Group C is battle polish. Group D closes the cutover.

```
A. Core robustness        01 ─ device & error resilience
                          02 ─ capabilities & render quality
                               │
B. Soldier art pipeline   03 ─ glTF importer & bake toolchain
                          04 ─ per-class VATs & clip tables      (needs 03)
                          05 ─ materials, textures & faction mask (needs 04)
                          06 ─ mounted units & equipment          (needs 04)
                          07 ─ LOD mesh tiers                     (needs 04)
                               │
C. Battle fidelity        08 ─ shadows & terrain elevation
                          09 ─ effects & corpses                  (polish)
                               │
D. Release gates          10 ─ scenario & visual acceptance reports
                          11 ─ hardware perf & cutover audit      (needs 10, A, B, C)
```

Groups A, B, C are independent of each other and can interleave. Group D's
final cutover (slice 11) is the integration point that depends on the rest.

## Review Map

| Slice | What a human runs / sees |
| --- | --- |
| 01 | Fault-injection lab route: force device loss / bad shader, see recovery or a clear error, not a blank canvas. |
| 02 | Capability probe page: limits/features report, MSAA on/off compare, GPU timestamp readout. |
| 03 | Asset workbench app: drop a `.glb`, see it bake to VAT and render beside the placeholder; validation failures shown inline. |
| 04 | Soldier gates per class driven by per-class VATs instead of one global VAT. |
| 05 | Turntable/ingame crops showing real materials + faction accents (crest/shield/sash masks). |
| 06 | Mounted-unit gate: horse + rider as composed skeletons; cavalry no longer fused boxes. |
| 07 | Zoom sweep showing L0/L1/L2 mesh swaps; perf probe at crowd scale. |
| 08 | Battle scene with grounded shadows and soldiers climbing terrain relief. |
| 09 | Battle vibe with dust/impact, 3D projectiles, distinct corpses. |
| 10 | Generated `scenario-runs` + blessed `visual-report` manifest; cutover scoreboard goes from PENDING to scored. |
| 11 | Named-hardware perf report + green `cutover:webgpu` / `release:webgpu` audit. |

## Firewalls

- Do not touch `crates/**` (sim) or campaign renderer code.
- Do not wire the WebGPU minimap pass.
- Real art is optional input — slices must pass with placeholders so the build
  never blocks on an artist.
- Screenshot scores are diagnostic only; acceptance is scene evidence + crops +
  unbiased `screenshot-critique` + human review (foundation invariant).

## Known Unknowns

- Whether real soldier `.glb` assets will arrive during this build (slice 03
  must work with or without them).
- Target hardware/browser for the named-hardware perf baseline (slice 11).
- Whether per-class skeletons differ enough to need distinct bone counts, or one
  shared humanoid skeleton + a separate horse skeleton suffices (slice 04/06).

## Next Agent Prompt

You are building the WebGPU conversion completion. Last updated: 2026-06-29.

Current status: **Slices 01–02 shipped and green** (Group A complete).

**Slice 02 (capabilities & render quality) shipped:**
- `requestAdapter({ powerPreference: 'high-performance' })`; device requests
  `timestamp-query` + storage/buffer limits up to the adapter ceiling.
  `resolveDeviceCaps` is the single source of truth for granted limits,
  MSAA/timestamp support, chosen depth format, and downgrades.
- `assertStorageBufferFits` guards the VAT storage buffer against
  `maxStorageBufferBindingSize`. `depthContract.chooseDepthFormat` owns the
  depth24plus→depth32float fallback decision.
- `frameShell` measures per-frame GPU time via a 2-entry timestamp QuerySet (read
  back without stalling) and threads a per-shell `sampleCount` through the
  color/depth attachments + every battle/core/fixture pipeline; MSAA resolves to
  the canvas on the last phase.
- `/webgpu/capabilities` probe route + `webgpu-capabilities` scene: caps,
  depth-fallback decision, VAT guard, live GPU-time readout, and an MSAA 1x-vs-4x
  edge-aliasing assertion (276 vs 0 transition pixels). Unprimed
  screenshot-critique confirmed the 4x edge is smoother.
- **Open decision for David:** MSAA is fully wired but production runs at
  `sampleCount 1`. Enabling 4x in the battle renderer (`createFrameShell(...,
  { sampleCount: 4 })` in `web/src/battle/rendererWebGPU.ts`) is a one-line flip
  held for your call on sample count (2x vs 4x) and always-on vs quality-tier —
  it re-blesses battle baselines, so it's gated on your feedback.
  `GPUSupportedLimits` getters aren't own-enumerable, so limits are read by name.

**Slice 01 (device & error resilience) shipped and green.**
- `compileShader` helper (`packages/webgpu-core/src/compileShader.ts`) routes
  every non-campaign shader compile through `getCompilationInfo()` so a WGSL
  typo surfaces a structured `file:line — message` error instead of a blank
  canvas. Off the render loop (fire-and-forget, shaders build once).
- `device.ts` wraps `requestAdapter`/`requestDevice` in try/catch and
  `attachDeviceErrorHandlers` wires `device.lost` + `onuncapturederror`.
- `frameShell` guards context acquisition and `encoder.finish()`/`queue.submit()`,
  goes fatal-on-error (stops submitting), and exposes `health()` +
  `onDeviceLost`/`onFatalError` callbacks.
- Shared `web/src/shared/fatalError.ts` renders an actionable "GPU was reset —
  reload" panel over the canvas (covers the canvas box only, leaves sibling
  diagnostics readable). Wired into battle renderer faults and both
  battle/campaign `renderer.ready.catch`.
- New `/webgpu/fault-injection` lab route (three buttons: bad shader, rejected
  submit, device loss) + `webgpu-fault-injection` scene gate, plus two source
  gates in `webgpu-lab-routes` (every shader via `compileShader`; every
  `renderer.ready` has a `.catch`). Added to `scenario:webgpu`.

Firewall note: campaign renderer passes (`game-renderer/src/campaign/*`) were
left untouched per the spec; the `compileShader` source gate is scoped to
non-campaign roots. Only the campaign `renderer.ready.catch` (scene controller,
pure robustness) was added.

Next pickup: **Slice 03 (glTF importer & bake toolchain)** — Group B. Build the
glTF→VAT importer + bake toolchain + asset workbench, with procedural
placeholders staying the shipping default (do not make any slice depend on real
`.glb` art existing).

Active warnings:
- Keep the sim and campaign renderer untouched; this is non-campaign renderer
  work only.
- Placeholders must remain the shipping default. Do not make any slice depend on
  real `.glb` art existing.
- Do not wire the WebGPU minimap pass; the 2D canvas renderer is intentional.

Global TODO:

- [x] Slice 01: device-loss, init-error, uncaptured-error, submission guards,
  and shader-compilation reporting, with a fault-injection lab route.
- [x] Slice 02: capability/limit validation, depth-format fallback,
  high-performance power preference, MSAA, GPU timestamp queries.
- [ ] Slice 03: glTF→VAT importer, bake toolchain, asset workbench app, and the
  real-art replacement contract (placeholders stay default).
- [ ] Slice 04: `classId→VatBake` mapping and per-class clip tables replacing the
  single global VAT/layout.
- [ ] Slice 05: sampler/texture bind group with albedo/normal/orm + per-pixel
  faction-mask accents.
- [ ] Slice 06: real horse VAT + rider composition and per-piece equipment
  composition; cavalry no longer fused boxes.
- [ ] Slice 07: L0/L1/L2 mesh tiers with an `lod` field on `CrowdInstance` and
  LOD-aware grouping in battle.
- [ ] Slice 08: battle shadow pass (port campaign `drawShadows`) and soldier
  terrain-elevation field.
- [ ] Slice 09: battle particles/impacts, 3D projectiles, distinct corpses.
- [ ] Slice 10: generate scenario-run reports and bless the visual-comparison
  manifest + current-renderer archive; wire soldier/model gates into the report.
- [ ] Slice 11: named-hardware perf report and a green cutover/release audit.

Before ending any pass, update this section with new status, next pickup point,
blockers, and checklist state.

## Slices

1. [Device And Error Resilience](slices/01-device-and-error-resilience.md)
2. [Capabilities And Render Quality](slices/02-capabilities-and-render-quality.md)
3. [glTF Importer And Bake Toolchain](slices/03-gltf-importer-and-bake-toolchain.md)
4. [Per-Class VATs And Clip Tables](slices/04-per-class-vats-and-clip-tables.md)
5. [Materials, Textures And Faction Mask](slices/05-materials-textures-and-faction-mask.md)
6. [Mounted Units And Equipment Composition](slices/06-mounted-units-and-equipment-composition.md)
7. [LOD Mesh Tiers](slices/07-lod-mesh-tiers.md)
8. [Battle Shadows And Terrain Elevation](slices/08-battle-shadows-and-terrain-elevation.md)
9. [Battle Effects And Corpses](slices/09-battle-effects-and-corpses.md)
10. [Scenario And Visual Acceptance Reports](slices/10-scenario-and-visual-acceptance-reports.md)
11. [Hardware Perf And Cutover Audit](slices/11-hardware-perf-and-cutover-audit.md)
