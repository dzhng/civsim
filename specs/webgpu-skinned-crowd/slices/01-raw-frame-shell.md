# 01 — Raw WebGPU Frame Shell

## Contract

The app can run a raw WebGPU renderer shell that owns canvas configuration,
resize, render passes, camera uniforms, and deterministic terrain/marker pixels.

## API Seam

- `packages/webgpu-core/src/frameShell.ts`
  - `createFrameShell(canvas, options): RawFrameShell`
  - `resize(size)`
  - `setCamera(cameraSnapshot)`
  - `drawFrame(commands)`
  - `destroy()`
- `packages/webgpu-core/src/cameraUniform.ts`
  - derives GPU camera data from `web/src/shared/camera.ts`.

## Playable Deliverable

- `/webgpu/frame-shell`
- Shows warm terrain plane and simple instanced markers in world coordinates.
- Debug overlay lists canvas size, DPR, camera matrix, and instance count.

## Verification

- Scenario screenshot checks warm terrain and marker colors.
- A fixed world point maps to the same screen pixel as `Camera.worldToScreen`.
- Resizing does not blank the canvas.
- No Babylon/Three runtime dependency in this shell.

## Must Stay Green

- `web/src/shared/camera.ts` stays unchanged.
- Raw-WebGPU lab routes still load.

## Human Feedback

This is the first “is raw WebGPU pointed at the same world?” checkpoint.
