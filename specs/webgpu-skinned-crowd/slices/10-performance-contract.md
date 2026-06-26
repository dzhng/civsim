# 10 — Performance Contract

## Contract

The renderer has a real hardware performance gate, not a SwiftShader illusion.

## API Seam

- `packages/webgpu-core/src/perfStats.ts`
  - frame time, upload time, cull time, draw time when available.
- `/webgpu/perf`
  - fixed map/count/camera scenario with deterministic placeholder assets.

## Playable Deliverable

- Browser perf route with count sliders and a fixed benchmark preset.
- Report panel includes GPU/browser/resolution, skinned count, impostor count,
  sprite count, draw calls, and frame time.

## Verification

- Headless CI keeps a liveness gate only.
- Real hardware gate records a named GPU/browser/resolution and target numbers.
- Perf report can be exported into the final postmortem.

## Must Stay Green

- Correctness tests run before perf tuning.
- No benchmark threshold is accepted without hardware context.

## Human Feedback

Use this to decide if the architecture is fast enough before investing in final
art polish.
