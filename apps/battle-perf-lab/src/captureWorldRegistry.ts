import type { PhotorealBattleWorld } from "../../../packages/photoreal-renderer/src/battle/battleWorld";

import type { BattleReplayCommand, BattleReplayMethod } from "./fixture";

export interface PresentationEvent {
  sequence: number;
  animationFrame: number;
}
interface CaptureObserver {
  command(command: BattleReplayCommand): void;
  presented(event: PresentationEvent): void;
}
const worlds = new WeakMap<HTMLCanvasElement, { world: PhotorealBattleWorld; sequence: number }>();
const observers = new WeakMap<HTMLCanvasElement, CaptureObserver>();

export function observePresentations(canvas: HTMLCanvasElement, observer: CaptureObserver) {
  observers.set(canvas, observer);
  return () => observers.delete(canvas);
}

export function capturedWorld(canvas: HTMLCanvasElement) {
  const world = worlds.get(canvas);
  if (!world) throw new Error("Capture world is not ready");
  return world.world;
}

export function hasPresented(canvas: HTMLCanvasElement) {
  return (worlds.get(canvas)?.sequence ?? 0) > 0;
}

/** The lab observes outer semantic calls; nested render calls only mark presentation. */
export function registerCaptureWorld(canvas: HTMLCanvasElement, world: PhotorealBattleWorld) {
  const entry = { world, sequence: 0 };
  worlds.set(canvas, entry);
  const methods: readonly BattleReplayMethod[] = [
    "setTime",
    "draw",
    "uploadUnitReadouts",
    "drawTris",
    "drawTacticalLines",
    "settlePresentedFrame",
    "render",
  ];
  const target = world as unknown as Record<BattleReplayMethod, (...args: unknown[]) => unknown>;
  const originals = new Map<BattleReplayMethod, (...args: unknown[]) => unknown>();
  const dispose = world.dispose;
  let depth = 0;
  for (const method of methods) {
    const original = target[method];
    originals.set(method, original);
    target[method] = function (...args: unknown[]) {
      if (depth === 0) observers.get(canvas)?.command({ method, args } as BattleReplayCommand);
      depth++;
      try {
        const result = Reflect.apply(original, world, args);
        if (method === "render") {
          entry.sequence++;
          observers
            .get(canvas)
            ?.presented({
              sequence: entry.sequence,
              animationFrame: world.world.renderer.info.frame,
            });
        }
        return result;
      } finally {
        depth--;
      }
    };
  }
  world.dispose = function () {
    worlds.delete(canvas);
    observers.delete(canvas);
    for (const [method, original] of originals) target[method] = original;
    this.dispose = dispose;
    dispose.call(this);
  };
}
