# 00 — strand-readability + anti-tiling spike (kill/commit)

**Visual variable:** projected strand structure (and its repetition), nothing else.
**Production change:** none. This slice must not move a single existing baseline.

## Contract unlocked

Proof (or a recorded kill verdict) that a small deterministic procedural bake reads as
tangled dry turf at the REAL top-down and RTS cameras — not dots, blur, carpet weave, or
moiré — and that rotated two-sample anti-tiling hides the tile period at acceptable cost.
Everything expensive downstream depends on this answer; that is why it runs first.

## API seam

New module `packages/photoreal-renderer/src/battle/turfTexture.ts` (final home, built
spike-first):

```ts
export interface TurfBakeSpec {
  sizePx: number;              // trial 128 / 256 / 512; expected winner 256–512
  tileWorldM: number;          // trial ~3–8 m; strand width ~2–4 cm implied
  seed: number;                // fixed constant; mulberry32-style PRNG; never time-derived
  strokeCount: number;         // trial ~1500–2500
  palette: TurfBakePalette;    // literals derived from GROUND_COVER_COLOR['green-grass']
                               // for the spike; slice 01's owner takes over after
}
export interface BakedTurfTexture { texture: THREE.Texture; spec: TurfBakeSpec; }
export function bakeTurfStrandTexture(spec: TurfBakeSpec): BakedTurfTexture;
export function turfDetailNode(baked, worldXY, opts: { scale; strength }): Vec3Node;
```

- **Bake tech: 2D canvas** (impostorLayer precedent) — layered curved tapered strokes
  (2–3-segment arcs, 3 length scales, per-stroke value/warmth jitter within the palette,
  hue constant), toroidal duplication for seamlessness, then renormalize per-channel mean
  to 1.0 so the result is a CENTERED MULTIPLICATIVE detail map (composes over any cover,
  adds zero net brightness). RepeatWrapping, mipmaps, anisotropy min(4, caps).
  GPU render-target bake is the fallback only if canvas is too slow at load — canvas
  avoids the RT-mip-determinism unknown entirely.
- **Anti-tiling: rotated two-sample blend, variance-preserving** — two hash-rotated/offset
  taps per ~8–15 m macro-cell, low-freq-noise blend weight, renormalized about the mean
  (`sqrt(w1²+w2²)`) so blending doesn't wash contrast. All three drafts independently
  chose this over 3-tap hex tiling for a self-similar low-contrast generated tile under a
  fill-rate budget. Hex tiling is the pre-declared escalation INSIDE `turfDetailNode` —
  no consumer-visible change.

## Runnable artifact

New scene `web/scenes/battle/battle-ground-turf.mjs` (route `/renderer/battle-ground-turf`),
workbench cases on a neutral-lit olive plane using the real camera framings:

- `turf-tile.png` — raw tile · 4×4 naive repeat · anti-tiled, side by side.
- `turf-spike-topdown.png` / `turf-spike-rts.png` — the plane at the real top-down and
  RTS projections, with negative controls in-frame (flat color, current isotropic fbm).
- `turf-spike-sizes.png` — 128/256/512 comparison strip.

## Verification

- Determinism: same spec/seed ⇒ byte-identical bake across two cold boots (unit test +
  double-boot snap); different seed ⇒ different hash; no `Date.now`/`Math.random`/TSL time.
- Anti-tiling: no visible lattice or super-tile in a ≥8×8-tile field at any zoom;
  eyeball + (optional) autocorrelation probe.
- Perf floor: record one-sample vs two-sample ground-fill cost on hardware; ALSO capture
  the feature-wide before-report — `VERIFY_GPU=1` hardware `battle-perf-30k`, archived to
  `specs/battle-ground-turf/reports/perf-before.json`.
- Zero production movement: full existing snapshot suite untouched.
- **compare-screenshots**: judge `turf-spike-topdown.png` against `assets/ref-topdown-turf.png`
  and `turf-spike-rts.png` against `assets/ref-rts-meadow.png` — structure only (tangle,
  multidirectionality, survival under minification); their hue is not a target.
- **screenshot-critique** (unprimed, fresh subagent) on the spike shots is the last check
  before recording the verdict.
- Human checkpoint (non-blocking): open the spike shots via preview-shots, ~5 min window;
  on silence decide on the evidence, record verdict + rationale in the README, close Preview.

## Kill criteria (record the verdict in the README either way)

- Strands vanish into mush/dots at the RTS camera at every trialed size/scale.
- Two-sample blend leaves a visible lattice AND hex-tiling's third tap breaks the perf floor.
- Stable mips unobtainable (only reachable via the GPU-RT fallback and it proves
  nondeterministic per adapter).
- Two-sample cost exceeds +0.3 ms median GPU on the workbench plane.

A kill does not kill the whole feature: slices 01, 02, 04 still ship (palette owner,
contrast, edges); 03 is re-specced (e.g. toward anisotropic in-shader strand noise).

## Stays green

Everything — typecheck, full snapshot suite byte-identical, campaign untouched, cargo untouched.

## Feedback that changes this slice

- "Looks like straw laid on top" → stroke curvature/length/value jitter.
- "Carpet fibers" → density + orientation distribution.
- "Disappears at RTS" → tileWorldM / stroke width / mip bias, never blade width.
- "Still camo" → not this slice; that is 02.
