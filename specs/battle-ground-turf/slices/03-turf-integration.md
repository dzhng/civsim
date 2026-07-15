# 03 — anisotropic in-shader turf detail

**Visual variable:** directional strand-scale structure and its near-to-far
survival. Contrast stays frozen at 02's accepted values; earth edges (04), blade
geometry, palette hue, shadows, and environment remain out of scope.
**Depends on:** 02. Slice 00 is a recorded KILL that constrains this technique:
do not reintroduce a baked strand texture or rotated texture taps.

## Contract unlocked

The production fine-detail layer reads as tangled dry turf through continuous,
analytic world-space noise rather than isotropic speckle or a repeated image.
One shader owner supplies playable ground, vista mesh, and the terrain-quad band;
there is no texture resource, bake lifecycle, sampler lattice, upload, or readback.

## API seam

`packages/photoreal-renderer/src/battle/groundDetail.ts` remains the one owner of
detail composition and its constants. Extend that owner with an internal
anisotropic strand field; do not create a sibling `turfTexture` module.

The strand field is built from continuous absolute world XY:

- two or three nonparallel directional ridges, with deliberately different
  length/frequency bands rather than one repeated curl vocabulary;
- low-frequency coordinate warp to bend ridges and a separate cluster envelope
  to create tangles, sparse gaps, and overlap without hue islands;
- short-blade breakup that prevents long wire/noodle lines in the RTS near field;
- derivative-aware or camera-distance attenuation that removes sub-pixel energy
  before it aliases, while retaining mid-scale directional character through the
  real top-down and RTS stops;
- fixed numeric phases only: no texture, wall clock, camera-relative origin, or
  unseeded randomness.

Start with six single-octave `vnoiseN` evaluations total—the same noise-call count as the
two replaced 3-octave fine fbms: one warp, one cluster envelope, one continuous short
breakup envelope, and three materially different directional ridge bands. Filter each
band from the fragment-coordinate footprint (`fwidth` of its warped coordinates), with
the lowest-frequency band surviving farthest. Three/TSL 0.185.1 exposes typed fragment
derivatives; keep this field out of vertex/normal paths.

`groundDetailNode` replaces the current isotropic fine `blade` fbm terms
(`4.7`/`12.0`) with this field; it does not stack both. Preserve 02's accepted macro
drift/mottle call **before** farGrass, then apply a strand-only call **after** farGrass;
otherwise the real RTS mid/far band overwrites the structure this slice is meant to add.
The quad calls the same strand-only owner after its accepted composition. Playable and
vista share the same ground path and both terrain-quad styles use absolute world phase.
Backdrop underpaint remains detail-free beyond haze. Water, rock/scree, and churn
masks suppress the strand term where those materials own the pixel.

The rejected renderer-lab canvas helper and its unit test are deleted when the analytic
workbench replaces them; the texture-sampler perf scene is also removed in favor of the
production perf oracle. Its negative reference/candidate evidence remains under the
spec's `assets/` and `reports/`; no workbench-only implementation survives as a second
production concept.

## Runnable artifact

Replace the rejected bake panels on `/renderer/battle-ground-turf` with analytic
negative controls: flat, current isotropic fine fbm, and strand field, all under
the production camera rig. Use absolute `positionWorld.xy` in every panel; translated
meshes with `positionLocal` would create a false phase reset. Keep legends in DOM/status
instead of allocating label textures. The scene keeps addressable shots:

- `turf-spike-topdown` — primary structure judgment;
- `turf-spike-rts` — near/mid/far filtering judgment with labels outside the
  transition under review;
- `turf-spike-sizes` is replaced by an orientation/scale strip that varies the
  shader's strand band, not a nonexistent texture resolution;
- `turf-tile` is replaced by a wide phase-continuity field with no image-tile
  premise.

Add the production fixture frames `topdown`, `rts`, `far-band`, and
`strands-close`; film or sample a deterministic zoom ladder across the blade-field
cutoff to prove there is no pop.

## Verification

- Compare top-down and RTS crops against `ref-topdown-turf.png` and
  `ref-rts-meadow.png` on structure only: multidirectional tangle and clumped
  gaps, without carpet grain, looping straw, or homogeneous far blur.
- Run a fresh unprimed screenshot critique on every accepted frame. The slice is
  red if either real camera stop repeats slice 00's failure, even when metrics
  improve.
- Inspect tight 3× crops of top-down, RTS near, RTS mid, and RTS far. Record the
  near-to-far transition explicitly; a full-frame thumbnail is insufficient.
- Prove continuous world phase across playable→vista→quad boundaries and across
  a camera pan. No hard seam, orientation flip, macro-cell reset, or phase pop.
- Double cold boots are pixel-identical. No `time`, `Math.random`, texture
  allocation, per-frame upload/readback, or new draw call exists.
- Pair hardware `battle-perf-30k` with `reports/perf-before.json`: all 33 ms
  assertions remain green, median GPU delta ≤ +0.3 ms, rAF p95 delta ≤ +1.5 ms.
  Add a strand-off shader control to attribute cost without changing geometry,
  blade density, shadows, or post.
- Use the normal no-update sweep → enumerate → mask-diff → reviewed bless wave.
  Campaign remains byte-identical and carried-red failures are not blessed.

## Stays green

02's contrast telemetry (also re-run with strand strength zero), blade
close/ring/width/static-field contracts, battle-map-style, photoreal parity,
battle camera zoom, water/slope/shadow/sky/post scenes, campaign, and cargo.

## Feedback that changes this slice

- Carpet/felt → widen length distribution and cluster envelope; do not add
  isotropic high-frequency noise.
- Straw/wire/noodles → shorten long ridges, increase short breakup, and reduce
  curvature coherence.
- Far-field mush → preserve a lower-frequency directional band while attenuating
  only sub-pixel ridges.
- Moiré/crawling → strengthen derivative/distance attenuation; never stabilize by
  snapping to camera or macro cells.
- Quad-band detail does not survive honest minification → drop its strand term and
  keep the band in family through shared palette + accepted broad contrast; record
  the narrowing.
- Perf red → reduce analytic octave/direction count inside `groundDetailNode`;
  never buy budget with blade density, shadow quality, or post.
