# 01 — `windSignal`: shared CPU wind source-of-truth

**Track:** foundation · **Gate:** determinism unit test (no visual verdict) ·
**Join root:** grass `07` + audio `23`.

## Contract
One deterministic wind signal that both the renderer (grass sway, GPU) and the audio
subsystem (wind + rustle gains, CPU) read — so we never grow two divergent wind
implementations. Replaces the inline `sin()` wind constants as the *source of truth*
(grass keeps consuming wind, but now from this owner).

## API seam
- **NEW** `packages/game-renderer/src/battle/windSignal.ts` (beside `grassField.ts`
  and `meadowPalette.ts`, the CPU data owners):
  - `sampleBattleWind(x: number, y: number, t: number) => { speed, gust, dirX, dirY }`
    — a trimmed analytic mirror of the pen's `windAtJS`: mean vector (pen mean 4.2
    m/s, dir ~292°) + coherent gust cells + turbulence. **Pure function of `t`**
    (seconds, the `setTime` scalar) — no wall-clock, no `Math.random` at call time
    (seed constants only).
  - `windProfile(height: number) => number` — the log boundary-layer profile (taller
    blades feel more wind).
  - A GPU-binding factory: `createWindUniforms()` / `updateWindUniforms(t)` that
    authors the grass shader's wind uniforms **on the CPU from the `setTime` scalar**,
    so the GPU side never touches the banned TSL `time` node.
- Grass (`07`) binds the GPU uniforms; audio (`23`) calls `sampleBattleWind` on the
  CPU. The inline wind constants in `bladeFieldLayer.ts` are removed when `07` lands.

## What a human can run
A lab debug view rendering the field (velocity arrows / gust heatmap over the pen's
~440 m span) and a `write-vibe` GIF of gust fronts sweeping — proving the *signal*
before either consumer wires it.

## Verification
- **Determinism unit test (the gate):** `sampleBattleWind(x,y,t)` called twice with
  the same `t` → byte-identical; a fixed `t`-sweep → a stable golden series.
- Not a hero-compare slice (this is the raw signal, judged in `07`/`23`).

## Must stay green
Everything — this is new, and until `07` consumes it the grass render is unchanged.

## Delegated to implementer
Number of gust cells; whether to port the pen's OU cell-meander now or start with
analytic gust-bands (`windBandAnalytic`); RT-vs-uniform for the GPU side is deferred
to `07` (analytic uniform recommended first per R2).

## Reslice hooks
`01a` CPU analytic + determinism proof; `01b` GPU uniform binding — if the signal
model turns out to have hidden variables.
