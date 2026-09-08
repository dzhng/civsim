# Browser state-hash correctness

`Game::state_hash()` forwards the existing `Sim::state_hash()` fingerprint.
The wasm boundary does not define a second hash or change simulation state;
JavaScript receives the full unsigned value as a `bigint`.

On 2026-09-09 Bangkok, a fresh main-thread `Game` and a fresh module-worker
`Game`, each advanced by 600 ticks, both produced **`ca84560505612d9d`**.
The check was repeated after reviewing the temporary browser harness.

The fixture uses production's simulation seed `0x5eed_c0de`, generated-map
seed `7n`, commanders off, and the unchanged `battle-perf-30k` spawn grid,
which produces 30,560 soldiers. Native probes use separate seeds and have
separate oracle values; this comparison is strictly worker versus main using
the same wasm binary and fixture.

Evidence provenance: source `2bef8193d96ca5351be85827523864d7361358c9` plus
this export; Chrome `152.0.7977.77` on an Apple M5 Pro; standard release
`bun run build:wasm`. Wasm SHA-256:
`62f860792e6e8f63d25d0a9dbc7994be8b4c7fcfc6f355bea2d63358775945e8`.

The release wasm build and `cargo check -p game-wasm` passed, and the generated
binding declares `state_hash(): bigint`. This establishes the additive
export and this cross-thread fixture's identity. It supplies no transport
performance or worker keep/drop verdict.
