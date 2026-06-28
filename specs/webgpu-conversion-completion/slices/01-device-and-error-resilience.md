# Device And Error Resilience

## Contract

The renderer survives or fails *loudly* on every WebGPU error path it currently
ignores. A lost device recovers (or shows a clear, actionable error); a bad
shader, a failed device request, or a rejected command submission surfaces a
diagnostic instead of a silent blank canvas.

## Why

The device/error layer is happy-path only. Concrete gaps from the gap review:

- No `device.lost` listener or recovery anywhere (`packages/webgpu-core/src/device.ts:12-32`,
  `frameShell.ts:372-414`); `queue.submit()` is unguarded (`frameShell.ts:538`).
- `requestDevice()` has no try/catch (`device.ts:20`); `getContext('webgpu')` is
  non-null-asserted (`frameShell.ts:374`); `renderer.ready.then()` has no
  `.catch()` (`web/src/battle/scene.ts:1240`) → unhandled rejection.
- No `getCompilationInfo()` on any of 15+ shader modules (`frameShell.ts:684`,
  `skinnedPipeline.ts:238`) → silent blank screen on a WGSL error.
- No `onuncapturederror` handler anywhere; `encoder.finish()` can throw with no
  diagnostic.

## API Seam

- `packages/webgpu-core/src/device.ts` — `requestDevice` wrapped in try/catch;
  attach `device.lost` promise handling; set `onuncapturederror`.
- `packages/webgpu-core/src/frameShell.ts` — guard context acquisition, command
  submission (`encoder.finish()` / `queue.submit()`), and expose a
  `onDeviceLost` / `onFatalError` callback the app shell can render from.
- New helper `compileShader(device, code, label)` that calls
  `getCompilationInfo()` and throws/logs structured WGSL errors; route all
  `createShaderModule` sites through it.
- `web/src/battle/scene.ts` and campaign equivalent — `.catch()` on
  `renderer.ready` that renders a fatal-error surface.
- New lab route under `apps/webgpu-lab` / `web/scenes`: a **fault-injection**
  page with buttons to force device loss (`device.destroy()`), inject a broken
  shader, and reject a submission, so recovery/error UX is observable.

## Human Review

Open the fault-injection route. Each button produces a visible, correct outcome:
device loss either re-initializes and resumes or shows a "GPU was reset — reload"
panel; a bad shader shows the WGSL compile error (file, line, message), not a
blank canvas; a rejected submission logs a structured error.

## Verification

- Unit test `compileShader` surfaces error messages from a known-bad WGSL string.
- Lab-route probe asserts that after a forced device loss the renderer reaches a
  defined state (recovered or fatal-error surface), never a silent hang.
- Grep gate: zero un-`.catch()`ed `renderer.ready` call sites; every
  `createShaderModule` goes through `compileShader`.
- Existing battle/campaign scene gates stay green (no behavior change on the
  happy path).

## What Must Stay Green

- All existing WebGPU scene gates and screenshot baselines (no visual change).
- Frame timing — error handling must not add per-frame cost on the happy path
  (no `getCompilationInfo` await inside the render loop).

## Feedback That Would Change This Slice

- Whether device-loss should auto-recover or always require a reload (default:
  attempt one re-init, then show the reload panel).
- Whether fatal-error UX should be a renderer overlay or hand back to the menu.
