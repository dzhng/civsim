# Held renderer comparison rounds

The [declared comparison](../../README.md) separates rendering from
live simulation throughput. These results are conditional evidence only. No
renderer is selected, and none of these held runs satisfies live acceptance.

## Three declared orders

All24 actual five-minute Menu tours completed. Every functional check passed;
every quiet-host verdict failed and remains failed. Identities, graphics settings
and held hashes match across orders. These are observed ranges, not statistical
confidence intervals:

| Held tick | Backend | Average FPS range | 1% low FPS range | p95 frame ms range |
| --- | --- | ---: | ---: | ---: |
| 9000 | three | 30.47–32.55 | 10.93–11.98 | 66.67–66.67 |
| 9000 | raw | 35.33–38.34 | 19.81–28.76 | 33.34–33.34 |
| 9000 | typegpu | 31.85–37.45 | 19.73–28.01 | 33.34–49.99 |
| 9000 | vgpu | 21.25–21.84 | 14.33–19.70 | 50.00–50.00 |
| 12000 | three | 27.24–28.41 | 8.25–8.53 | 83.33–83.33 |
| 12000 | raw | 31.81–32.30 | 17.91–19.79 | 49.99–50.00 |
| 12000 | typegpu | 29.54–30.68 | 14.79–19.17 | 50.00–50.00 |
| 12000 | vgpu | 18.66–19.89 | 9.23–11.64 | 66.67–66.67 |

Raw and TypeGPU are the leading pair for confirmation because their frame-time
tails are better than Three's across the observed orders, while vgpu has lower
overall cadence. This chooses the next experiment, not a production backend.
Raw and TypeGPU overlap in early-state averages and lows; later-state averages
favor raw, with overlapping lows. No overall performance winner follows yet.
The [phase ranges](three-order-ranges.json) preserve the per-phase spread used in
the decision, including GPU interval-union medians. Similar GPU intervals do not
explain vgpu's lower cadence or identify a cause.

## Completed confirmation

All eight leading-pair confirmations are now [archived](confirmation/README.md).
All functional checks pass and all host verdicts remain failed. Raw and TypeGPU
trade averages, lows and phase cadence; query-disabled later-state averages
reverse their ordering. The declared bounded rule therefore records a
**performance tie**, with maintenance and quality to decide the continued
implementation after coherent interior scene-count correctness is established.
No more broad timing rounds are planned. This does not establish equal engine
performance or satisfy final live acceptance.

The user-requested pause occurred after the first confirmation. Its original
[pause record](confirmation/pause.json) is historical, not current pending work.
Seven remaining trials completed after resume; build/shared-asset hashes matched
before they began. The overnight gap and substantial competing activity during
the first trial remain uncertainty. Query-disabled controls remove timestamps
and readbacks only; they retain CPU/submission observation.

## Shared conditions

All runs preserve 15,560 soldiers, 1440×900 CSS, 2880×1800 framebuffer, DPR2,
standard grass and far grass, bloom, unmuted audio and default single shadows.
Both expected canonical hashes remain fixed. Camera, pose and environment time
continue; the [held-input controls](../02-held-authority/README.md) describe what
that proves and the artificial pose-replay boundary it introduces. The fixed
builds use source8643cf05 and the earlier e9f4f080… WASM, intentionally independent
of the subsequently integrated simulation optimization.

## Reading the evidence

[Round0](round-0/comparison-summary.json),
[round1](round-1/comparison-summary.json) and
[round2](round-2/comparison-summary.json) summaries retain the original cadence
statistics, phase summaries, identities and complete host verdicts. GPU statistics
join each recorded frame to its submission id and use the complete, zero-missing-
query **interval union**, not the sum of overlapping passes. Median and nearest-
rank p95 use only those resolved samples. Missing samples remain counted; terminal
queries are not awaited. GPU intervals exclude queue wait and presentation and do
not explain frame pacing by themselves.

Each run directory retains the compressed raw Menu recording, trial verdict,
host observations and scenario checks, plus its manifest and exact trial log.
[Round0](round-0/archive-index.json), [round1](round-1/archive-index.json) and
[round2](round-2/archive-index.json)
archive indexes record uncompressed hashes and
original scratch paths; every compressed file was round-trip verified. Original
`run.json` files remain in scratch; their report and manifest are preserved here
without committing a second copy of the full recording.

These timing reports record cameras per frame and scene statistics at startup and
termination. They do not contain common interior-checkpoint geometry/LOD counts;
the comparison protocol's corresponding evidence requirement remains open. Do
not infer identical per-frame work from equal scene identity or from this table.
There is no new visual acceptance claim or changed performance threshold.
