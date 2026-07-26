# 00 — Lab fixture + `dt` seam + feasibility probes

**Track:** foundation · **Gate:** infra (no visual verdict) · **Unblocks:** everything.

## Contract
An addressable renderer-lab route at the hero-matched framing that both grass
candidates and every later grass slice are judged in; the frame-loop `dt` seam both
the stateful wind model and the audio director need; and **throwaway** TSL/audio
probes that kill R2/R3/R4/R5 *before* any polish is attempted.

## API seam
- **Lab route** `apps/renderer-lab/src/livingMeadowRoute.ts` → `/renderer/living-meadow`,
  registered in `router.ts` (flat `routes` map). Boots the current
  `PhotorealBladeFieldLayer` (production grass) beside the hero image. Params:
  `?crop=close|vista` (the two ratified framings — close ≈12 px/blade for anatomy,
  vista for the horizon), `?t=<seconds>` (fixed clock via `setTime`), `?impl=…`
  (reserved for `02`). Publishes `window.__rendererLabReady` + `__rendererLabStats`
  (`gpuTimeMs`, `drawCalls`, `submittedTriangles`) like the other lab routes.
- **`dt` seam:** thread the existing `frameDt` in `web/src/battle/scene.ts` `frame()`
  through the layer/audio update path (today layers receive a *time uniform*, not
  `dt`). One owner; no second rAF-delta computation.
- **Probes (throwaway, deleted at slice end — record verdicts in this file):**
  - **R2 wind-RT:** write a HalfFloat RGBA target from a node material and sample it
    in the grass position graph in the lab. Verdict: RT viable? or analytic-only?
  - **R3 backlight:** add a `dot(V,-sunDir)`+Fresnel emissive term to a
    `MeshStandardNodeMaterial` (or test `MeshPhysicalNodeMaterial.transmission`) on
    one blade patch. Verdict: which substrate carries the soft look (physical
    transmission vs faked emissive rim), and is the env **sun vector + shadow term**
    reachable cheaply at the blade (the `03` dependency)?
  - **R4 audio truth:** prove an `OfflineAudioContext` render → RMS/FFT assertion runs
    in vitest (Node). Verdict: is the deterministic audio gate available? (owned in
    detail by `20`, proven feasible here.)
  - **R5 autoplay+dt:** prove `ctx.resume()` from the battle start gesture unlocks and
    the per-frame `dt` is available to an audio update.

## What a human can run
`/renderer/living-meadow?crop=close` and `?crop=vista` — current grass at the hero
framing, next to `assets/pen-reference-hero.jpeg`. The two crops are the fixtures
every later grass slice re-uses.

## Verification
- Route boots, publishes stats, is byte-stable at fixed `?t=` (no animation change
  yet). Establishes — does **not** yet judge — the two comparison crops.
- Probe verdicts (R2/R3/R4/R5) written into a **Probe results** section appended to
  this file; throwaway probe code deleted.

## Must stay green
All existing `photoreal-battle`/turf baselines (this is purely additive).

## Delegated to implementer
Exact `camera3d` for the close/vista crops (must satisfy ~12 px close / horizon
vista); whether `__rendererLabStats` reuses `createPhotorealStatsPublisher`; probe
implementation details (they are thrown away).

## Feedback that would change this slice
If the close/vista framing David wants differs from the hero's implied camera, or if
a probe verdict forces a substrate choice we'd rather David weigh in on (R3).

## Probe results (2026-07-26)

R2 implements `?probe=r2` on `/renderer/living-meadow`: a `HalfFloat` RGBA
`THREE.RenderTarget` is written every frame by a deterministic node-material
`QuadMesh` pass, then a gated blade patch samples that target in its
`MeshStandardNodeMaterial.positionNode` and uses the same sample for tint. When
rendered, viable output should show a small blade patch lifted into wave bands
with yellow-green tint; broken output is a flat/black/white patch or WebGPU/TSL
validation failure. Code-level assessment: typechecks, uses `PhotorealWorld.setTime`
through an owned uniform, and hits no known TSL `time` or storage-read constraint.

R3 implements `?probe=r3`: a small `MeshStandardNodeMaterial` blade patch adds
`dot(V,-sunDir)` plus Fresnel as a warm emissive backlight term, with a neighboring
`MeshPhysicalNodeMaterial` transmission/thickness patch for comparison. When
rendered, viable output should show warm rim/backlight on blades viewed against the
environment sun; broken output is no rim, camera-locked lighting, or a physical
variant that validates but contributes no useful translucency. Code-level
assessment: typechecks; the environment sun vector is cheaply reachable from the
existing `PhotorealWorld.sunLight` and normalized into a material uniform; a
material-local shadow scalar was not cheaply reachable, so the probe relies on the
stock material lighting path for shadow integration and does not expose a custom
shadow term to the emissive graph.

**Browser-rendered verdicts (SwiftShader headless, 2026-07-26):**

- **R2 = VIABLE.** The rendered probe patch showed RT-driven per-blade tint and
  height variation (wave bands + yellow-green gradient), proving a HalfFloat RGBA
  target written by a node-material pass CAN be sampled in the grass
  `positionNode` on our WebGPU/TSL stack. Slice 07 may still start with the
  cheaper analytic-uniform wind; the render-target path is proven available as
  its reslice option.
- **R3 = VIABLE on `MeshStandardNodeMaterial` + emissive backlight.** Both probe
  patches rendered; the emissive rim term compiles and lights, and the sun
  vector is cheaply reachable from `PhotorealWorld.sunLight`. A material-local
  **shadow scalar is NOT cheaply reachable** — slice 03 builds the transmission
  as an emissive-term family over the stock lighting path (03a fixed-light,
  03b sun-coupled), not as a shadow-gated term. The probe's rim constant was
  deliberately overdriven (read blown-white); quality tuning is slice 03's job,
  not a feasibility concern.
- Probe code deleted from the route after these verdicts, per the contract.
- Determinism gate: two canvas-only captures of `?crop=close&t=4` were
  byte-identical.
- R4/R5 moved to slice 20 (the parallel audio lane owns them).
