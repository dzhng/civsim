# 00 — WebGPU Lab, Device, And Pixel Contract

## Contract

The feature has a fresh WebGPU lab app with first-class routes, and the browser
environment can create a WebGPU device and produce stable pixels that the
scenario harness can screenshot or read back.

## API Seam

- `apps/webgpu-lab/src/router.ts`
  - owns `/webgpu/...` route registration.
  - one route per slice; avoid new query-param test modes.
- `packages/webgpu-core/src/device.ts`
  - `requestWebGpuDevice(options): Promise<WebGpuDeviceInfo>`
  - owns adapter/device creation, feature checks, failure messages.
- `web/webgpu-probe-lib.mjs`
  - shared Playwright launch flags and pixel helpers.

## Playable Deliverable

- `/webgpu/device`
- CLI/scenario: `VERIFY_WEBGPU=1 node scenario.mjs webgpu-device`

The page draws a clear color plus a tiny triangle/quad and exposes
`window.__webgpuDeviceProbe`.

## Verification

- `navigator.gpu`, `requestAdapter`, and `requestDevice` succeed.
- Render pass completes.
- Screenshot/readback is nonblank and within a small color tolerance.
- Failure UI says WebGPU is required and names the missing step.

## Must Stay Green

- Existing non-WebGPU scenarios still run; this lab route is isolated.
- No sim/camera/input files change.

## Human Feedback

Confirm the route opens locally and gives a clear failure if WebGPU is disabled.
