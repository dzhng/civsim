# Retained native crowd packing

Each native mesh owner retains its appearance/rig mapping and per-audience,
per-LOD payload capacity. Packing writes records directly in input order; main
and shadow records retain a common pose slot. Only active prefixes are published.
Results remain borrowed until the next pack, so asynchronous owners reject an
overlapping upload and release ownership in `finally`. Growth and disposal cannot
restore a disposed mesh. TypeGPU copies into its public host buffer and submits
only the active byte range; unused capacity is not uploaded.

## Evidence

A CPU control compares the prior stateless packer from commit 1f20c7bc with the
candidate for 120 frames of 15,560 soldiers, 20 appearances and three rig groups.
Every payload byte, pose index and impostor count matches. The first 60 frames
warm all tested buckets; over the remaining 60, baseline Float32 payload backing
allocations total 7,200 / 39,211,200 bytes, versus zero for the candidate. This does
not count small views or JavaScript allocations and is not a timing, GPU transfer,
physical-memory or FPS claim. Capacity stays at each owner's observed peak until
that owner is released.

Each backend also completes 120 paused generated-seed-7 camera presentations at
tick 30 after 30 warm frames, 1440×900 CSS at DPR 2, using actual game routes.
All receipts submit, ticks remain fixed and no page/presentation errors occur.
This is a hardware smoke control, not pixel parity or continuous-live acceptance.
The original raw probe's buffer-label assertion does not apply to TypeGPU; its
first run completed the camera checks but failed that raw-only assertion. The
cross-backend control omits that observer assertion and retains submission/error
checks. No timing conclusions use these instrumented runs.

Four pure packer tests cover shared/interleaved slots, retained capacity, bucket
moves, shrink/empty frames, invalid recovery and separate owner storage. Four
mesh-owner tests exercise actual asynchronous upload methods with mocked palettes
and no GPU geometry: pending input survives rejected overlap, errors release the
owner, and disposal cannot restore readiness. These do not cover GPU growth;
hardware sweeps cover ordinary rendering. The 21 existing audience tests pass.
Relevant TypeScript checks and independent code review pass.

## Test behavior changes

The existing shared-slot test uses the new owner API with unchanged expectations.
New tests add storage-lifetime and active-prefix requirements; no previous visual
baseline or performance threshold changes. Full live motion and net-shadow
acceptance remain open.
