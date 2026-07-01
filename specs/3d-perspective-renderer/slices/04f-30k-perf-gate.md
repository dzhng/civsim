# Slice 04f — The 30k-soldier + foliage perf gate (standing, hardware-only)

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
