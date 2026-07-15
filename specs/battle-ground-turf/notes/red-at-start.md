# Carried-red scene ledger

Canonical pre-change sweep for slice 01, captured from `9a18f22e` before any source edit:

```sh
VERIFY_URL=http://localhost:5187 VERIFY_GPU=1 \
  SCENARIO_REPORT_JSON=../throwaway/turf01-pre/full-scenes.json \
  node scene.mjs --full
```

The run used bundled headless Chromium and SwiftShader, selected all 75 scenes, and
completed 931 checks. It exited 1 with these seven failures:

| Scene | Failing check | Evidence |
|---|---|---|
| `battle-overlays` | `snapshot overlays/rings-close` | 20,695 pixels / 2.0210% |
| `battle-renderer-effects` | `snapshot battle-projectiles-dpr2` | 86,275 pixels / 2.1063% |
| `battle-smoke` | `snapshot battle-initial` | 858 pixels / 0.0838% |
| `battle-smoke` | `snapshot battle-manual` | 54,356 pixels / 5.3082% |
| `water-sea` | `snapshot water/campaign-sea-far` | 35,024 pixels / 4.7635% |
| `full-game-rendering-performance` | `perf campaign measures the normal raw-WebGPU campaign route` | SwiftShader frame median 283.355 ms exceeded the hardware-oriented assertion |
| `menu-renderer-shell` | `scene completed without throwing` | unsupported-route probe called `getComputedStyle` with a missing element |

There were no page errors. These failures are carried; later turf slices must not bless
or attribute them to ground work without separate evidence.

## Slice 01 comparison

The settled post-change sweep again ran all 75 scenes with no page errors. Its five
carried screenshot failures reproduced the exact pre-change pixel counts above, and the
SwiftShader-only campaign performance check remained red. The menu-shell probe completed
on this run, so its intermittent pre-change exception did not recur.

The first post-change sweep also exposed one intentionally stale contract: the existing
grass-close scene still required blade palette provenance from
`foliageLayer.ts GRASS_ALBEDO`. Slice 01 updates that assertion to require the canonical
`meadowPalette.ts MEADOW.blade` owner. A focused rerun then passed all ten checks, including
the enabled/disabled/enabled blade variants, zero-pixel close snapshots, packed stride,
and record hash `e72c1663`.

Across the 180 full-suite snapshot checks, 178 emitted byte-identical comparison telemetry.
The two fluctuations were independently reproduced as timing-sensitive noise: the battle
minimap returned from 78,922 changed pixels to the pre-change 78,946 without a source edit,
while the quick-battle modal moved again from 18,395 to 18,730. Neither is a turf consumer;
all campaign snapshot telemetry was byte-identical.
