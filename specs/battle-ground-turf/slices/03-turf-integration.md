# 03 — production turf integration

**Visual variable:** strand-scale detail presence/strength and material-family continuity.
Contrast frozen at 02's accepted values (if strands make 02's numbers feel wrong, record it
for a single 05 trim — don't twiddle both here). Edges (04), blade geometry, hue: frozen.
**Depends on:** 00's COMMIT verdict + 02.

## Contract unlocked

The proven turf resource is the production fine-detail layer for playable ground, vista
meshes, and both terrain-quad styles — REPLACING the isotropic fine terms, not stacking on
them. One texture, one sampler, one bake per terrain load.

## API seam

- `battleWorld` owns the resource lifetime: bake once when `setTerrain()` resolves the
  cover (`meadowPalette` supplies `turfBake` for that cover); rebake only if a later
  terrain load changes cover; never for camera/zoom/environment/mesh-rebuild. Dispose with
  the world. Publish `renderStats.terrain.turfDetail = { seed, sizePx, bakeCount, consumers }`.
- Same `BakedTurfTexture` handed to `createGroundMesh` (playable + vista via existing
  options passthrough) and `BattleBackgroundQuads` — no consumer allocates or clones its own.
- Composition happens only inside `groundDetailNode` (02's owner): the `blade` fbm terms
  (@4.7 + @12.0) are REPLACED by `turfDetailNode`; quad light/dark/stone flecks and stubble
  ridges likewise at a coarser world scale (`backdropMaterial`'s speck term zeroed — it
  lives beyond haze). Turf strength + the fold-down of the removed fbm amplitudes are new
  `TURF_CONTRAST` entries.
- The spike's workbench-only material param is removed — this slice makes the resource a
  real terrain dependency. Losing anti-tiling candidates are deleted.
- Distance behavior: mips do most fading; strand strength additionally ramps down into the
  existing farGrass transition uniforms (no new distance system) so minified strands hand
  off to 02's mottle instead of greying to mush. Suppressed under waterBlend, slope-rock,
  and churn masks (they own those pixels).
- Sample from absolute world XY only — never camera focus or per-band origin.

## Runnable artifact

`battle-ground-turf.mjs` re-snapped: `topdown.png` (primary judgment), `rts.png`,
`far-band.png` (both zoom stops — the band must show the same family), plus new
`strands-close.png` at the `battle-map-style-grass-close` framing proving the texture
doesn't fight the real blade field where blades render, and a filmed zoom ladder (or short
vibe) across the blade-field cutoff to confirm no pop.

## Verification

- **compare-screenshots**: `topdown.png` vs `assets/ref-topdown-turf.png` — does the ground
  read as combed dry turf rather than dithered noise, with no visible tile period? Also vs
  02's accepted `topdown.png` (less-wrong: added tangle, unchanged contrast).
- **screenshot-critique** (unprimed) on all four shots — last check before blessing.
- 00's anti-tiling check re-run in situ (≥8×8 tiles in frame, no lattice, no phase seam at
  the playable/quad boundary — quads and mesh must agree on world phase).
- Determinism: two cold boots byte-identical on the fixture shots.
- Resource discipline: bakeCount stays 1 through pan/zoom/style-flip/mesh-rebuild; disposal
  exactly once at teardown; no per-frame upload/readback/draw-call growth.
- Perf: paired hardware `battle-perf-30k` vs `reports/perf-before.json` — ≤ +0.3 ms median
  GPU, ≤ +1.5 ms rAF p95, all 33 ms assertions green; record with sampler force-disabled to
  isolate the taps' cost.
- Re-bless wave per protocol (no-update sweep → enumerate → mask-diff → one commit).
  Campaign byte-identical; `turf-tile.png` unchanged (bake untouched by integration).
- Non-blocking preview-shots checkpoint (~5 min).

## Stays green

02's contrast telemetry (re-run on the strand-off capture), blade
close/ring/width/static-field contracts, battle-map-style, photoreal-parity,
battle-camera-zoom, water/slope/shadow/sky/post scenes, campaign, cargo.

## Feedback that changes this slice

- Ghost lattice / contrast wash → hex-tiling escalation inside `turfDetailNode` (perf re-run).
- Strands invisible on the quad band under minification → REMOVE band sampling and record
  the narrowing (family then defined by shared palette+contrast, not shared taps).
- "Carpeted"/repetitive at top-down → raise tileWorldM / strokeCount in the bake spec, one
  variable at a time.
- "Competes with unit readability" → lower strand strength while holding 00's readability floor.
- Perf gate fails on two taps → one tap + stronger mottle masking, recorded; never buy time
  with blade density or shadow quality.
