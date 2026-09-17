// @vitest-environment node
import { expect, test, vi } from "vitest";
import { BattleRenderer } from "../src/battle/renderer";
import {
  captureBattleRenderCamera,
  type BattlePresentation,
} from "../src/battle/battlePresentation";
const camera = () =>
  captureBattleRenderCamera({
    zoom: 2,
    zoomT: 0.5,
    viewCenter: () => [3, 4],
    params: () => ({
      target: [3, 4, 0],
      distance: 100,
      yaw: 0,
      pitch: 0.7,
      fovY: 1,
      aspect: 1.5,
      near: 1,
    }),
  });
const packet = (): BattlePresentation => ({
  timeSeconds: 1,
  clock: "wall",
  fixedTime: null,
  preserveFrozenEffects: false,
  camera: camera(),
  tacticalLines: {
    groundCues: new Float32Array(),
    rings: new Float32Array(),
    effects: new Float32Array(),
  },
  crowd: {
    positions: new Float32Array([1, 2]),
    facings: new Float32Array([0]),
    playback: [],
    alive: new Float32Array([1]),
    count: 1,
    observationTick: 7,
    frameDt: 0.02,
    standards: [],
    readouts: [],
    triangles: new Float32Array([1, 2, 3]),
  },
});
function fixture(submit = true) {
  const events: string[] = [];
  const renderer = Object.create(BattleRenderer.prototype) as BattleRenderer;
  Object.assign(renderer, {
    renderedFrameId: 4,
    setUnitReadouts: vi.fn(() => events.push("readouts")),
    draw: vi.fn(() => events.push("draw")),
    drawTris: vi.fn(() => events.push("triangles")),
    drawTacticalLines: vi.fn(() => {
      events.push("render");
      if (submit) Object.assign(renderer, { renderedFrameId: 5 });
    }),
    frameMetrics: () => ({ gpuSubmission: null }),
  });
  return { renderer, events };
}
test("source present is synchronous and uses capture override hooks in original startup order", () => {
  const f = fixture(),
    p = packet();
  const result = f.renderer.present(p, undefined, () => f.events.push("startup-settle"));
  expect(result).not.toBeInstanceOf(Promise);
  expect(f.events).toEqual(["readouts", "draw", "triangles", "startup-settle", "render"]);
  expect(f.renderer.draw).toHaveBeenCalledWith(
    p.crowd!.positions,
    p.crowd!.facings,
    p.crowd!.playback,
    p.crowd!.alive,
    1,
    p.camera,
    7,
    0.02,
  );
  expect(result).toMatchObject({ submitted: true, renderedFrameId: 5, gpuSubmission: null });
});
test("skipped frozen presentation does not fabricate a submission and empty arcs preserve implicit clearing", () => {
  const f = fixture(false),
    p = packet();
  p.crowd!.triangles = new Float32Array();
  expect(f.renderer.present(p)).toMatchObject({ submitted: false, renderedFrameId: 4 });
  expect(f.events).toEqual(["readouts", "draw", "render"]);
});
test("cancelled presentation cannot enter source hooks or submit after the startup hook", () => {
  const f = fixture(),
    abort = new AbortController();
  abort.abort();
  expect(() => f.renderer.present(packet(), abort.signal)).toThrow();
  expect(f.events).toEqual([]);
  const next = new AbortController();
  expect(() => f.renderer.present(packet(), next.signal, () => next.abort())).toThrow();
  expect(f.events).toEqual(["readouts", "draw", "triangles"]);
});
test("camera packet remains fixed after live camera and its target arrays change", () => {
  const target: [number, number, number] = [1, 2, 3],
    center: [number, number] = [5, 6];
  const live = {
    zoom: 2,
    zoomT: 0.4,
    viewCenter: () => center,
    params: () => ({ ...camera().params(), target }),
  };
  const captured = captureBattleRenderCamera(live);
  target[0] = 999;
  center[0] = 999;
  live.zoom = 99;
  expect(captured.params().target).toEqual([1, 2, 3]);
  expect(captured.viewCenter()).toEqual([5, 6]);
  expect(captured.zoom).toBe(2);
});

test("aborted startup readiness cannot settle the shared renderer again after two animation frames", async () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return 1;
  });
  try {
    const renderer = Object.create(BattleRenderer.prototype) as BattleRenderer;
    const world = { settlePresentedFrame: vi.fn(async () => {}) };
    Object.assign(renderer, { world, disposed: false });
    const abort = new AbortController();
    const pending = renderer.settlePresentedFrame(abort.signal);
    await Promise.resolve();
    abort.abort();
    callbacks.shift()!(0);
    callbacks.shift()!(0);
    await pending;
    expect(world.settlePresentedFrame).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("source environment time follows a held benchmark clock and otherwise keeps its wall clock", () => {
  const renderer = Object.create(BattleRenderer.prototype) as BattleRenderer;
  const times: number[] = [];
  const world = {
    soldierAssets: null,
    setTime: (seconds: number) => times.push(seconds),
    draw: () => {},
    drawTris: () => {},
    drawTacticalLines: () => {},
    uploadUnitReadouts: () => {},
    gpuSubmissionIdentity: () => null,
  };
  Object.assign(renderer, {
    world,
    fixedTime: null,
    preserveFrozenEffects: false,
    renderedFrameId: 0,
    readoutFrameKey: "",
    triangleVerts: new Float32Array(),
    frameStart: 0,
    framePerf: { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 },
  });
  const clock = vi.spyOn(performance, "now").mockReturnValue(4000);
  try {
    renderer.present({ ...packet(), clock: "benchmark", timeSeconds: 12.5 });
    expect(times).toEqual([12.5, 12.5]);
    times.length = 0;
    renderer.present({ ...packet(), timeSeconds: 12.5 });
    expect(times).toEqual([4, 4]);
  } finally {
    clock.mockRestore();
  }
});
