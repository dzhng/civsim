# Slice 03 narrowed visual gate

The accepted result has no synthetic fine-detail substrate. Three attempted
families remain negative evidence: baked taps, continuous ridges, and cell
capsules. Their respective failures were fuzzy grain/loops, felt/weave, and
comma/stipple primitives that disappeared under filtering.

Fresh review accepted the six production proofs under the real camera rig:
full and ground-only close, RTS, and top-down. In the full close and RTS frames,
blade geometry supplies resolvable meadow texture without lattice, weave, or a
distance ring. The smooth ground-only controls prove that geometry—not hidden
substrate noise—owns that texture. At top-down, blade geometry correctly drops
below the render cutoff and the slice 02 macro/canopy field retains broad olive
variation without camo islands or subpixel grain.

The six snapshots are byte-stable across cold boots and pass without an update
environment. The ground-only substrate returns pixel-identically after a camera
pan. The corrected slice 02 telemetry is recorded in
`../assets/telemetry/contrast.json`; its original values were blade-confounded.

The hardware `battle-perf-30k` oracle ran on Apple Metal with 30,560 soldiers.
Mid measured 27.12 ms median / 30.04 ms p95 GPU; vista measured 22.84 ms /
27.76 ms. Continuous pan, zoom, wheel burst, and close-fill rAF p95 all remained
below 23.4 ms. Every locked 33 ms assertion passed.

