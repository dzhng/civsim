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
