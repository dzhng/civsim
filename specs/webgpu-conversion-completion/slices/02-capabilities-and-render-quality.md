# Capabilities And Render Quality

## Contract

The renderer asks the adapter for what it needs, validates that it got it, and
degrades deliberately when it doesn't. Edges stop aliasing (MSAA) and GPU time
becomes measurable (timestamp queries) so the perf budget is enforceable.

## Why

Gaps from the gap review:

- `requestAdapter({})` never sets `'high-performance'` despite the type existing
  (`device.ts:16`, `webgpu-globals.d.ts:93`).
- `requestDevice()` requests no `requiredLimits`/`requiredFeatures` (`device.ts:20`);
  the VAT storage buffer is sized to `byteLength` with no check against
  `maxStorageBufferBindingSize` (`skinnedPipeline.ts:123-127`).
- `depth24plus` is hardcoded with no fallback to `depth32float`
  (`depthContract.ts:6`, `frameShell.ts:643-648`).
- No `sampleCount` on `canvas.configure()` (`frameShell.ts:425`) and no
  `multisample` on any pipeline (`pipelineContracts.ts:8-25`,
  `skinnedPipeline.ts:239`) → lines/edges alias.
- Perf is CPU-only (`perfReport.ts:24-37`, `perfStats.ts:1-11`); no `QuerySet` /
  `writeTimestamp` → GPU stalls are invisible to the budget.

## API Seam

- `packages/webgpu-core/src/device.ts` — `requestAdapter({ powerPreference:
  'high-performance' })`; pass `requiredLimits`/`requiredFeatures` (incl.
  `timestamp-query` when available) and expose the granted limits.
- `packages/webgpu-core/src/capabilities.ts` — validate granted limits, expose a
  `caps` object (max storage buffer size, MSAA support, timestamp support,
  chosen depth format); single source of truth for downgrades.
- `packages/webgpu-core/src/depthContract.ts` / `frameShell.ts` — choose depth
  format from caps with a `depth32float` fallback.
- `frameShell.ts` + `pipelineContracts.ts` — thread a `sampleCount` through
  `canvas.configure`, the depth texture, and every pipeline's `multisample`.
- `perfReport.ts` / `perfStats.ts` — optional GPU timestamp `QuerySet`, resolve
  to the perf report alongside CPU timings.
- Capability probe scene under `web/scenes`: prints caps, toggles MSAA, shows the
  GPU timestamp readout.

## Human Review

Open the capability probe. The report lists granted limits and chosen formats.
Toggle MSAA and confirm edges smooth on soldier silhouettes and projectile lines.
The GPU-time readout is non-zero and tracks load. Force a low-limit path (probe
flag) and confirm the VAT buffer check and depth fallback log a deliberate
downgrade instead of crashing.

## Verification

- Probe asserts: `caps` populated; VAT buffer rejected/split when it would exceed
  `maxStorageBufferBindingSize`; depth fallback selected when `depth24plus` is
  unavailable.
- Before/after MSAA crops on a soldier-edge fixture show reduced aliasing; re-bless
  affected baselines once.
- Perf report includes a GPU-time field when `timestamp-query` is supported and
  omits it (without erroring) when not.

## What Must Stay Green

- Battle/campaign scene gates (re-bless only the baselines MSAA intentionally
  changes, with a note in the change ledger).
- Frame budget — MSAA cost stays within the documented battle budget at crowd
  scale; if not, MSAA is capability-gated.

## Feedback That Would Change This Slice

- MSAA sample count (2x vs 4x) and whether it is always-on or quality-tier gated.
- Whether GPU timestamps ship in production or stay a dev-only probe.
