# Worker 00: PENDING — evidence, 2026-09-09 Bangkok

**No keep/drop verdict.** The cross-thread hash check passes, but no browser
performance sample meets the required quiet-machine precondition. Worker 01
has not started and no threshold has changed.

## Provenance and fixture

- Source: `2bef8193d96ca5351be85827523864d7361358c9`, before tick-track changes,
  plus only the additive `Game::state_hash()` export in `game-wasm`.
- Machine: Apple M5 Pro, Mac17,9, 18 logical CPUs, 48 GiB RAM; macOS
  26.4.1 (25E253). Browser: Chrome `152.0.7977.77`, Playwright headless,
  channel `chrome`, viewport 1280×800. The production renderer reported
  `apple / metal-3` during the hardware smoke.
- Launcher imports `GPU_HARDWARE_FLAGS` from `web/renderer-probe-lib.mjs`:
  `--enable-unsafe-webgpu`, `--enable-unsafe-gpu`,
  `--enable-features=WebGPU`. No refresh-rate or frame-limit override.
- Toolchain: Node 24.14.0, Bun 1.3.14, Rust 1.94.1, wasm-pack 0.15.0,
  Playwright 1.60.0. Standard `bun run build:wasm` release build, including
  its SIMD/LTO options.
  Wasm SHA-256:
  `62f860792e6e8f63d25d0a9dbc7994be8b4c7fcfc6f355bea2d63358775945e8`.
- Worktree: `/Users/david/dev/game-sim-perf-worker`, dev server port 5179.
  Main route: `?map=gen&seed=7&ai=off`. Camera/framing follows the existing
  30k renderer gate's mid stop: zoom 3, yaw/pitch bias 0, centre `(0,-310)`.
- Production simulation seed is `0x5eed_c0de`; generated-map seed is `7n`.
  The gate's unchanged 500-man spawn grid grows this fixture to 30,560 men.
  Commanders remain off, matching the worker-00 spawn script and renderer
  baseline. Initial packed snapshot payload is 834,920 bytes.
- The baseline native generated-map probe instead seeds both simulation and
  map with 7; its duel matrix seeds simulation with 11. Those native oracles
  are distinct fixtures, not another expected value for the browser hash.

The temporary probe lives entirely in gitignored `throwaway/worker-spike`.
It loads its host module into the actual production page instead of adding a
production debug API or registering a temporary scene. It uses a separate
wasm instance in a module worker, with the main sim paused and its renderer
still drawing. The buffers do not replace rendered state in this spike.
This is worker 00's AI-off/paused-render transport litmus, distinct from the native commanders-on
fighting fixture. Passing it would not establish the later live-AI, combat,
command-latency or end-to-end worker keep gates.

## What is established

[The retained export's correctness evidence](worker-state-hash.md) records the
successful release build, native check and matching worker/direct 600-tick
fingerprint on this fixture.

Both reviewed publication mechanisms completed one-second protocol smokes
using the production fixture: transferred buffers with recycling, and a
double-buffered SharedArrayBuffer with sequence counters. Frame identities,
copy consistency, recycling and metrics alignment passed. The fresh 600-tick
hash comparison was rerun after review and still matches. These are protocol
smokes, not performance or scheduling acceptance evidence.

[The raw empty-page cadence diagnostic](worker-00-cadence-loaded.json) retains
all 300 sorted intervals, browser version, launch flags and measured load.
At load 5.2915, intervals were 16.6–16.8 ms, with p50/p95 both 16.7 ms.
This suggests a roughly 60 Hz cadence floor for this harness and calls the
later 12 ms target / 14 ms kill boundary into question. **It is not a quiet
measurement and does not itself authorize a threshold change or verdict.**

All one-second transport timings are invalid as acceptance evidence: they
were loaded, too short and unreplicated. A loaded SwiftShader screenshot
attempt timed out and was aborted; its partial pixel counts are not baseline evidence. No hardware
renderer gate or complete three-by-20-second transport set has run yet.
Dedicated idle windows never reached load <4. The
[latest bounded acquisition](worker-00-quiet-acquisition.json) ran for
120.001 seconds, observed 5.4883–6.7622 and launched no browser. The lowest
value across earlier windows was 4.09; no loaded result is a cadence or performance
verdict. Further acquisition waits need changed conditions, not automatic repeats.

## Measurement definitions and review

The next run records the raw components separately: worker `advance_ticks(1)`
time; rebuilding views and packing; `postMessage` publication work; and main
receiver copy/recycle work. Their per-frame CPU sum is reported as snapshot
processing cost. Snapshot age is separately the full wall time from tick
completion to receiver completion, using each context's `timeOrigin + now`.
No scheduling delay is subtracted from age; raw components remain available
if a different reading of "pack + delivery" is selected. Boot time spans
host worker creation through ready receipt; worker-local initialization time
is retained separately.

Shared reads verify the exact published sequence before and after copying;
post-initialization errors reject the run, and every frame must match its
worker metric record. Cleanup terminates workers, cancels timeout timers and
stops rAF sampling. Buffer exhaustion, stale shared slots and capacity growth
are explicit measurement errors. The temporary slots reserve initial payload
plus 1 MiB (three transfer slots or two shared slots); actual peak payload and
capacity are reported separately. Both modes use the same paused page,
camera, matched 20-second off/on windows and rAF clock; mode order alternates
across repeats. Syntax checks and both reviewed runtime smokes pass.

## Pickup

At the next explicitly granted lane after conditions change, allow one quiet
acquisition of at most 120 seconds. If none qualifies, release the lane and
leave performance pending. If load qualifies, capture unchanged hardware
empty-page cadence first. A confirmed quiet 60 Hz floor supports an explicit
planning no-go against the unchanged 12/14 ms final requirements; it is not a
worker-00 threshold failure, and its transport table stays unmeasured. If
cadence permits those requirements, coordinate the prescribed matrix with the
parent. The reviewed smoke and hash checks are already complete.

Existing commands for the qualifying path:

```sh
node throwaway/worker-spike/cadence.mjs
node throwaway/worker-spike/run.mjs
VERIFY_URL=http://localhost:5179 bun run --cwd web perf:30k
VERIFY_URL=http://localhost:5179 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node web/scene.mjs battle-cpu-profile
PROFILE_SOLDIERS=30500 VERIFY_URL=http://localhost:5179 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node web/scene.mjs battle-cpu-profile
```

The spike requests three 20-second runs per transport, each paired with an
unchanged worker-off renderer window; it checks load before each off/on
sample and records load after it. Summarize medians of the three medians and
retain every failed/invalid attempt as such. The existing CPU-profile scene
uses `ai=off`; do not label those results AI-on. Reconcile the final cadence
threshold with the parent before any worker-01 implementation. At the end of
worker 00, replace this provisional report with the actual verdict/evidence,
keep only the hash export in production, and delete the temporary spike.
