// @vitest-environment node
import { expect, test, vi } from "vitest";
import { presentationRenderer } from "./support/battleRendererPresentation";
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
    playback: [
      {
        appearanceId: 0,
        base: {
          source: { kind: "clip", sample: { clip: "idle", phase: 0 } },
          destination: { clip: "idle", phase: 0 },
          weight: 1,
        },
      },
    ],
    alive: new Float32Array([1]),
    count: 1,
    observationTick: 7,
    frameDt: 0.02,
    standards: [],
    readouts: [],
    triangles: new Float32Array([1, 2, 3]),
  },
});
test("present uploads one coherent packet before the startup hook and submission", async () => {
  const f = presentationRenderer(),
    p = packet();
  const result = await f.renderer.present(p, undefined, () => f.events.push("startup-settle"));
  expect(f.events).toEqual([
    "readouts",
    "crowd",
    "triangles",
    "startup-settle",
    "lines",
    "prepare",
    "submit",
  ]);
  expect(f.instances[0][0]).toMatchObject({
    x: 1,
    y: 2,
    facing: 0,
    alive: true,
    playback: p.crowd!.playback[0],
  });
  expect(f.triangles).toEqual([p.crowd!.triangles]);
  expect(result).toMatchObject({
    submitted: true,
    renderedFrameId: 5,
    gpuSubmission: { submissionId: 1, source: "battle-draw" },
  });
});
test("empty arcs clear prior geometry and a repeated frozen packet retains its submission", async () => {
  const f = presentationRenderer(),
    p = packet();
  await f.renderer.present(p);
  p.fixedTime = 1;
  p.crowd!.triangles = new Float32Array();
  const first = await f.renderer.present(p);
  expect(f.triangles.at(-1)).toEqual(new Float32Array());
  f.events.length = 0;
  expect(await f.renderer.present(p)).toMatchObject({
    submitted: false,
    renderedFrameId: first.renderedFrameId,
    gpuSubmission: first.gpuSubmission,
  });
  expect(f.events).toEqual([]);
});
test("cancelled presentation cannot upload or submit after the startup hook", async () => {
  const f = presentationRenderer(),
    abort = new AbortController();
  abort.abort();
  await expect(f.renderer.present(packet(), abort.signal)).rejects.toThrow();
  expect(f.events).toEqual([]);
  const next = new AbortController();
  await expect(f.renderer.present(packet(), next.signal, () => next.abort())).rejects.toThrow();
  expect(f.events).toContain("crowd");
  expect(f.events).not.toContain("submit");
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

test("aborted startup readiness cannot submit again after two animation frames", async () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return 1;
  });
  try {
    const f = presentationRenderer();
    await f.renderer.present(packet());
    f.events.length = 0;
    const abort = new AbortController();
    const pending = f.renderer.settlePresentedFrame(abort.signal);
    // Let the first readiness submission reach its animation-frame barrier.
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    const rejected = expect(pending).rejects.toThrow();
    abort.abort();
    callbacks.shift()!(0);
    callbacks.shift()!(0);
    await rejected;
    expect(f.events.filter((event) => event === "submit")).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("presentation time stays captured for both benchmark and wall-clock packets", async () => {
  const f = presentationRenderer();
  const clock = vi.spyOn(performance, "now").mockReturnValue(4000);
  try {
    await f.renderer.present({ ...packet(), clock: "benchmark", timeSeconds: 12.5 });
    expect(f.times).toEqual([12.5, 12.5]);
    f.times.length = 0;
    await f.renderer.present({ ...packet(), timeSeconds: 17.25 });
    expect(f.times).toEqual([17.25, 17.25]);
  } finally {
    clock.mockRestore();
  }
});
