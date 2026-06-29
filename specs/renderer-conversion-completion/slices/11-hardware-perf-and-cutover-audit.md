# Hardware Perf And Cutover Audit

## Contract

The release audit passes on real evidence: a performance report captured on named
hardware against a current-renderer baseline, plus a green `cutover:renderer` /
`release:renderer` run once the art, robustness, battle, and report slices have
landed. This is the integration slice that declares the non-campaign conversion
cutover-ready.

## Why

- Perf evidence is headless SwiftShader only; the spec says release evidence
  requires named hardware, browser, resolution, and a current-renderer baseline
  (`../done/renderer-skinned-crowd-foundation/README.md`). The harness
  `full-game-rendering-performance.mjs` is production-ready but
  `web/reports/rendering/performance/full-game-rendering-performance.json` has never
  been produced on real hardware.
- Running cutover today fails/pends across the board: missing release-review shot
  coverage, FAIL artifact-performance-report, PENDING hardware-perf,
  `releaseReady=false` (`renderer-release-audit.mjs`).

## API Seam

- Run `full-game-rendering-performance.mjs` on a named GPU/browser/resolution; persist
  `performance/full-game-rendering-performance.json` with the hardware context and a
  current-renderer baseline comparison.
- Run `release:renderer` (`web/package.json`) end to end; resolve each remaining
  audit failure to a real status.
- This slice depends on: slice 10 (reports exist), Group A (robustness — no
  silent failures under load), Group B (real-or-blessed-placeholder soldiers so
  the visual-parity gate is honest), Group C slice 08 (battle grounding).

## Human Review

Open the release audit output: hardware-perf gate cites a named GPU and a real
baseline delta; visual-improvement gate reads blessed comparisons; the scoreboard
reports `releaseReady=true` (or names exactly what still blocks it). A human signs
off that WebGPU is equal-or-better for play, per the foundation invariant.

## Verification

- `performance/full-game-rendering-performance.json` exists with named-hardware
  context and baseline comparison.
- `cutover:renderer` and `release:renderer` run end to end; every gate is a real
  pass/fail, none `pending`/`missing-*`.
- Frame budgets met at full-game scale on the named hardware.

## What Must Stay Green

- All prior slices' gates (this is the aggregate).
- Foundation invariant: the audit informs the human decision; a green scoreboard
  is necessary, not sufficient — explicit human acceptance is the gate.

## Feedback That Would Change This Slice

- The named target hardware/browser/resolution for the baseline.
- The acceptance bar: equal-or-better vs. "good enough to cut over with known
  follow-ups" (which follow-ups are acceptable to defer).
