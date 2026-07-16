# 03 — synthetic fine-detail KILL and narrowed ownership

## Shipped result

Every synthetic substrate-fiber family was killed: baked taps became fuzzy grain
and loops; continuous ridges became felt or weave; current-cell capsules exposed a
lattice; stable neighbor-cell capsules removed the lattice but still became commas,
stipple, or disappeared under filtering. None survives in production.

The accepted ownership is simpler. `groundDetailNode` contains only slice 02's
macro drift/mottle. Existing blade-field geometry owns resolvable near and RTS turf,
while the shared canopy and macro value structure carry distance and top-down. There
is no fine-mode API, fine constants, texture, sampler, strand helper, or alternate
production path.

Fresh critique accepted full production close, RTS, and top-down frames plus their
ground-only controls. The smooth controls at close and RTS prove geometry supplies
the missing texture; top-down correctly avoids synthetic subpixel noise. All six
accepted frames are deterministic, and the ground substrate returns pixel-identically
after a camera pan.

## Negative evidence

The failed families and exact crops remain under `../assets/slice03-corrected/`
and `../reports/slice03-visual-comparison/`. The bounded neighbor-cell run is in
`../reports/neighbor-cell-perf.json`. Its alternating rAF pairs were viable, but GPU
timestamps were unavailable and the visual gate rejected the primitive. These
artifacts explain why production intentionally has no synthetic fine detail; they
are evidence, not dormant implementation instructions.

Do not reintroduce baked taps, directional ridges, periodic cross-sections, or cell
capsules by tuning thresholds. A future synthetic-detail proposal needs a new
technique and the same real-camera visual and performance gates.

## Verification record

- Fresh unprimed review accepted full and ground-only close, RTS, and top-down.
- All six snapshots are byte-identical across cold boots and pass without an
  update environment.
- The ground-only RTS frame returns pixel-identically after a 260 m camera pan.
- The corrected blade-free slice 02 telemetry is in
  `../assets/telemetry/contrast.json`.
- `battle-perf-30k` passed every locked 33 ms assertion with live hardware GPU
  timestamps: 27.12 ms median at mid and 22.84 ms at vista.
- Campaign code and snapshots are untouched; blade geometry, density, width,
  cutoff, shadows, water, and post remain unchanged.

## Durable ownership

- Near and RTS turf texture: existing blade-field geometry.
- Distance and top-down: shared macro/canopy value structure.
- Meadow colors: `meadowPalette.ts`.
- Ground contrast and composition: `groundDetail.ts`.
- Synthetic substrate fibers: deliberately none.

## Evidence index

- Accepted verdict and performance: `../reports/slice03-visual-gate.md`
- Moved-test and shot ledger: `../reports/slice03-change-ledger.md`
- Corrected contrast telemetry: `../assets/telemetry/contrast.json`
- Accepted full/control frames: `../assets/slice03-narrowed-gate/`
- Rejected analytic frames: `../assets/slice03-corrected/`
