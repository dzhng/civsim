# Continuous palette timestamp lifetime

The merged standing hardware run met the existing timing limits but emitted Three's compute-query capacity warning. That run was not accepted. Palette compute introduced a second timestamp pool; the production frame boundary was resolving only the render pool.

## Correction and scope

The frame boundary now starts both timestamp resolutions without blocking rendering. Installed Three 0.185.1 owns pending-readback coalescing and resets each pool's allocated-query range before its asynchronous mapping. Both pools must drain; the published successful `gpuTimeMs` remains **render-only**, not a correlated compute-plus-render frame measurement. Inclusive timing remains the slice 07 task.

The existing terminal policy for **propagated timestamp resolution failures** now also disables `backend.trackTimestamp`, stopping new query allocation, and clears the published timing. An earlier successful promise cannot republish after that terminal state. This uses the backend's existing allocation flag rather than a second failure-state owner. There is no retry policy or warning suppression. Internal Three mapping failures are caught by Three and return its previous value, so production stats can remain stale for that case. This correction does not claim to detect failures that do not reach the world boundary; slice 07's frame-correlated measurements must account for that limitation. The existing scene runner captures every `console.error` in `wirePage` and fails its final page-error check, so Three's logged mapping failure still rejects the hardware run even if its promise fulfills.

## Verification

`cd web && node_modules/.bin/vitest run tests/photorealWorld.test.ts`: four tests pass. These instantiate the production world and call its actual frame boundary, replacing only the renderer/device edge.

- Original code left two compute queries pending while render queries drained.
- Original propagated-failure handling left backend allocation enabled; both render and compute rejection controls were red. These are resolution-boundary rejection controls, not actual mapping-failure injection.
- Removing only the late-success publication guard restored a stale timing of `99` after failure, where the test required `null`. Restoring the guard passed.
- Successful timing is `3` from render, not the compute control's `40`.

The standing hardware scene records warnings from navigation onward. The merged
repeat revealed Chrome's exact AudioContext user-activation policy warning on
direct URL launch; that unrelated signal is counted separately. Every other
warning fails, including the compute-query exhaustion warning. Console errors
still fail without exclusions. All existing soldier-count, timing and coverage
limits remain unchanged. No visual or animation-quality acceptance is claimed.

The isolated tree's typecheck reports only its thirteen known verification-copy migration errors in old raw/source tests, with none in this correction. `git diff --check` passes.

## Changed test behavior

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Production world timestamp tests | No frame-boundary query-lifetime regression coverage | Both pools drain; terminal failures stop allocation and invalidate timing; concurrent late success stays suppressed | Prevent pool exhaustion and stale timing acceptance |
| Standing 30k hardware scene | Browser warnings did not fail the gate | Any non-audio-policy warning fails; exact browser autoplay warning counted separately | The observed query-exhaustion warning is load-bearing without expanding into unrelated audio startup. **moved** |
