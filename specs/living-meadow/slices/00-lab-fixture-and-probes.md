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
