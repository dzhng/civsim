# 17 — shared-shell-primitives

**Contract unlocked:** the fixed-step clock, the held-key/edge-pan/wheel camera
controller, and the renderer-ready/fatal handoff each have one owner in
`web/src/shared/`, consumed by both scenes.

## Seam

```ts
// web/src/shared/simClock.ts
export class SimClock {
  constructor(o: { tickHz: number; maxTicksPerFrame: number });
  paused: boolean; timeScale: number; frozen: boolean;
  advance(nowMs: number): number;   // ticks due this frame; drops backlog past the cap
  readonly tick: number; readonly alpha: number;
}
// web/src/shared/cameraKeys.ts
export interface CameraKeyTarget {
  panWorld(dx: number, dy: number): void; yaw(delta: number): void;
  pitchOrZoom(delta: number): void; zoomAt(px: number, py: number, factor: number): void;
  panSpeed(): number;
}
export function createCameraKeyController(target: CameraKeyTarget, opts?: { edgePx?: number; sprint?: number; enabled?: () => boolean }): { update(dt: number): void; dispose(): void };
// web/src/shared/rendererReady.ts
export function awaitRendererReady(ready: Promise<void>, canvas: HTMLCanvasElement, onReady: () => void): void; // .then + .catch(showFatalErrorSurface(fatalSurfaceFor("init", …)))
```

Consumers: `battle/scene.ts:796-870, 1688-1713, 2322-2330`,
`battle/input.ts:220-266`, `campaign/scene.ts:106-109, 344-373, 769-879,
185-191`. Readiness flag names (`__ready`, `markCampaignReady`) stay.

Behaviour changes to name in the commit (both are corrections, not
regressions): battle key-pan moves from a 50 ms `setInterval` to per-frame
`dt`; campaign gains the max-ticks clamp battle already has.
`campaign/scene.ts:51-52`: `SPEED_LABELS ["1x","3x","10x"]` disagrees with
`SPEEDS [1,2,4]` — labels derive from `SPEEDS`.

The `.ready.then(` footgun scanner in `renderer-lab-routes.mjs:798` must
already cover `web/src/shared/` (slice 04 widened it); if 04 has not landed,
widen it here.

## Decisions resolved here

One clock, one controller, one ready helper; EDGE = 14, sprint = 3 as today.

## Delegated to the implementer

Whether `SimClock` also owns the freeze/fixedTime snapshot flag or the battle
loop keeps it.

## Verification

- Seam tests (vitest): `simClock.test.ts` (accumulator, cap, pause, freeze),
  `cameraKeys.test.ts` (WASD/QE/ZX table, edge zones, sprint).
- G-verify-full (`battle-input`, `battle-camera-zoom`), G-camp (`campaign-lod`)
  at **0 px**.

## Must stay green

All battle and campaign scenes.

## Feedback that would change this slice

None.
