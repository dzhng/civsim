# Slice 04f — The 30k-soldier + foliage perf gate (standing, hardware-only)

## STATUS: DONE (2026-07-02) — gate GREEN, production renderer ~7.5× inside budget

**Scene:** `web/scenes/battle/battle-perf-30k.mjs` (NEW scene, not an extension —
`full-game-rendering-performance` is a four-route liveness/comparison report with
no fixed load; this gate is a single-purpose standing instrument with a locked
fixture, and the README's standing-gate list already names `battle-perf-30k`).
**Runner:** `bun run --cwd web perf:30k` (hardware); plain
`VERIFY_GPU=1 node scene.mjs battle-perf-30k` is the SwiftShader smoke.

**Fixture:** production `?map=A&ai=off` boot (15,560 soldiers) grown to
**30,560** through the production `spawn_class` path (30 × 500-soldier units on
a fixed grid — deterministic), plus map A's full foliage fill. The sim is
PAUSED (not frozen — freeze skips identical redraws) during sampling so every
rAF is a live full-frame draw and the measurement is the RENDERER, per this
slice's contract.

**Frame-time table (hardware: apple / metal-3, chrome, 1280×800, 150 warm
frames per stop after 60 warm-up, 2026-07-02):**

| stop  | zoom | soldiers | scenery | grass tufts | grass blades | grass tris | GPU median | GPU p95 | rAF median | rAF p95 |
|-------|------|----------|---------|-------------|--------------|------------|------------|---------|------------|---------|
| mid   | 3.0  | 30,560   | 548     | 2,536       | 22,824       | 182,592    | **4.35 ms** | 4.65 ms | 8.30 ms | 9.42 ms |
| vista | 9.5  | 30,560   | 548     | 16,800      | 184,800      | 1,478,400  | **4.30 ms** | 4.98 ms | 8.27 ms | 9.88 ms |

Budget median ≤ 33 ms: **PASS at both stops, ~7.5× headroom** (rAF is
vsync-pinned at this Mac's 120 Hz). Counts are published in the gate's check
JSON and floored (≥30,000 soldiers, ≥500 scenery, vista ≥15,000 tufts /
≥150,000 blade instances) so the load can't silently shrink. Evidence shots
land in `web/reports/rendering/scenario-runs/battle-perf-30k-{mid,vista}-*.png`.

**Findings while landing it (all real, none blocking):**
- **Bug found + fixed in `packages/renderer-core/src/frameShell.ts`:**
  `timestampWrites` emitted an EMPTY timestampWrites descriptor for a middle
  phase (neither first nor last) — a WebGPU validation error. Lab shells (≤2
  phases) never hit it; the 3-phase battle shell did the moment the GPU timer
  was enabled. Middle phases now get no timestampWrites entry.
- **Production instrumentation:** `BattleRenderer` now creates its shell with
  `enableGpuTimer: true` (caps-gated on `timestamp-query`) and publishes
  `renderStats.performance.gpuTimeMs`. Verified byte-identical rendering:
  battle-camera-zoom / battle-terrain-elevation snapshots 0.0000% diff, seating
  tripwire `match=true`, full-game-rendering-performance green.
- **Sim-side finding (out of scope for this renderer gate, recorded honestly):
  at 30k soldiers the SIM tick saturates the main thread when unpaused** —
  ~15 ms/tick × the catch-up cap ≈ 164 ms/frame wall time with ai=off idle
  soldiers. That is sim cost, not renderer cost (renderer frameCpuMs ~2–6 ms,
  GPU ~4.3 ms). If 30k live battles become a product goal, the sim tick budget
  needs its own (non-renderer) work. Side effect worth knowing: at 6 fps the
  Apple GPU downclocks between frames and gpuTimeMs reads ~15 ms — still inside
  budget, but the paused, vsync-cadence numbers above are the honest renderer
  measurement.
- **No CPU frustum cull on the crowd:** `renderStats.soldiers` stays 30,560 at
  every stop — the full crowd is drawn regardless of camera, so the GPU load
  includes all soldiers plus foliage (the 04e/14b LOD slices are where that
  changes; this gate will notice).
- SwiftShader leg confirmed: correctness smoke renders both stops
  (~1.0–1.2 s/frame software), counts + pixels assert, and the ms budget check
  is explicitly SKIPPED with a recorded note.

## Contract unlocked

The spec's hard performance floor becomes an *executable, standing gate* instead
of a README promise: a battle scene with **30,000+ soldiers plus dense
trees/grass** must render at **≤ ~33 ms/frame (30 fps) on this Mac's hardware
adapter**, with headroom above 30k. Every later slice (photoreal materials,
shadows, sky, foliage) re-runs this gate — a photoreal pass that blows the budget
is not done.

## API seam

- A new scene `web/scenes/battle/battle-perf-30k.mjs` (or extend
  `full-game-rendering-performance`): boots a battle world with ≥30k soldiers
  (use the quick-battle spawn path or `generatedFormation` at scale — sim AI can
  be off; this measures the RENDERER) plus a dense foliage fill
  (grass + terrain scenery at vista-realistic density), holds the camera at the
  mid and vista zoom stops, and reads `shell.stats().gpuTimeMs` over N warm
  frames.
- Report median + p95 per zoom stop into the scene's stats JSON; assert
  median ≤ 33 ms. Publish soldier/foliage counts alongside so the gate can't
  silently shrink.
- Runner: `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome
  node scene.mjs battle-perf-30k` — **hardware only**. Under SwiftShader the scene
  still runs (correctness smoke) but the ms assertion is skipped (SwiftShader is
  not a perf oracle; see README verification env).

## What the human can run / see

`bun run --cwd web perf:renderer:hardware` extended (or a sibling script
`perf:30k`) printing the frame-time table; the scene's shot shows the 30k field
at vista as visual evidence the load is real.

## Verification

- The gate itself IS the verification. Green = median ≤ 33 ms at both stops with
  ≥30k soldiers + foliage on screen. Red = report the table honestly; do not
  shrink N or the foliage density to pass.
- If today's renderer misses the budget at 30k: that is a REAL finding, not a
  gate bug — record the table, file the hotspots (likely LOD `04e` and foliage
  instancing), and treat closing it as prerequisite work for the photoreal ladder.

## Must stay green

- Once green, every subsequent slice keeps it green (re-run after each photoreal
  surface lands). This is the spec's "healthy margin above 30k" enforcement.

## Human feedback that would change this slice

The 33 ms budget and the 30k floor are the human's locked numbers (interview,
2026-07-02); changing either requires David.
