// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { RawBattleFrame } from "../../packages/battle-renderer/src/world/frame";
import { RawBattlePost } from "../../packages/battle-renderer/src/world/post";
import type { RawEnvironment } from "../../packages/battle-renderer/src/world/environment";

afterEach(() => vi.unstubAllGlobals());
function gpu() {
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 1, COPY_DST: 2 });
  vi.stubGlobal("GPUTextureUsage", { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, COPY_SRC: 4 });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2 });
  const live = new Set<object>();
  let allocations = 0,
    failAt = Infinity;
  const allocate = () => {
    if (++allocations === failAt) throw Error("injected allocation failure");
    const value = { destroy: () => live.delete(value), createView: () => ({}) };
    live.add(value);
    return value;
  };
  const device = {
    createBuffer: allocate,
    createTexture: allocate,
    createBindGroupLayout: () => ({}),
    createBindGroup: () => ({}),
    createSampler: () => ({}),
    createShaderModule: () => ({}),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
    queue: { writeBuffer: vi.fn() },
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn((): Promise<GPUError | null> => Promise.resolve(null)),
  };
  return {
    device,
    native: Object.assign({} as GPUDevice, device),
    live,
    fail: (offset: number) => {
      failAt = allocations + offset;
    },
    allocations: () => allocations,
  };
}
const environment = Object.assign({} as RawEnvironment, {
  exposure: 1,
  setView() {},
  sky: { setRays() {} },
});

test("same-size resize preserves camera/attachments and compiles nothing", async () => {
  const g = gpu(),
    frame = new RawBattleFrame(g.native, environment, 127, 95, 4, "rgba16float");
  const before = [frame.cameraLayout, frame.cameraGroup, frame.hdr];
  const allocations = g.allocations(),
    pipelines = g.device.createRenderPipeline.mock.calls.length;
  await frame.resize(127, 95);
  expect([frame.cameraLayout, frame.cameraGroup, frame.hdr]).toEqual(before);
  expect(g.allocations()).toBe(allocations);
  expect(g.device.createRenderPipeline).toHaveBeenCalledTimes(pipelines);
  frame.dispose();
  expect(g.live.size).toBe(0);
});

test("resize commits a complete replacement and retains camera identity", async () => {
  const g = gpu(),
    frame = new RawBattleFrame(g.native, environment, 127, 95, 1, "rgba16float");
  const group = frame.cameraGroup,
    hdr = frame.hdr,
    count = g.live.size;
  await frame.resize(191, 129);
  expect(frame.cameraGroup).toBe(group);
  expect(frame.hdr).not.toBe(hdr);
  expect([frame.width, frame.height]).toEqual([191, 129]);
  expect(g.live.has(hdr)).toBe(false);
  expect(g.live.size).toBe(count);
  frame.dispose();
  frame.dispose();
  expect(g.live.size).toBe(0);
});

test("every partial post constructor allocation is released", () => {
  const reference = gpu();
  new RawBattlePost(reference.native, {} as GPUTextureView, 127, 95).dispose();
  const count = reference.allocations();
  for (let offset = 1; offset <= count; offset++) {
    const g = gpu();
    g.fail(offset);
    expect(() => new RawBattlePost(g.native, {} as GPUTextureView, 127, 95)).toThrow("injected");
    expect(g.live.size).toBe(0);
  }
});

test("late allocation failure retains the old complete frame and permits retry", async () => {
  const g = gpu(),
    frame = new RawBattleFrame(g.native, environment, 127, 95, 4, "rgba16float");
  const hdr = frame.hdr,
    count = g.live.size;
  g.fail(10);
  await expect(frame.resize(191, 129)).rejects.toThrow("injected");
  expect(frame.hdr).toBe(hdr);
  expect([frame.width, frame.height]).toEqual([127, 95]);
  expect(g.live.size).toBe(count);
  await frame.resize(191, 129);
  frame.dispose();
  expect(g.live.size).toBe(0);
});

test("GPU admission failure retains old attachments and frees rejected resources", async () => {
  const g = gpu(),
    frame = new RawBattleFrame(g.native, environment, 127, 95, 1, "rgba16float");
  const hdr = frame.hdr,
    count = g.live.size;
  g.device.popErrorScope.mockResolvedValueOnce({ message: "injected validation" });
  await expect(frame.resize(191, 129)).rejects.toThrow("injected validation");
  expect(frame.hdr).toBe(hdr);
  expect(g.live.size).toBe(count);
  frame.dispose();
  expect(g.live.size).toBe(0);
});

test("pending resize rejects concurrent requests and cannot publish after disposal", async () => {
  const g = gpu(),
    frame = new RawBattleFrame(g.native, environment, 127, 95, 1, "rgba16float");
  let release!: () => void;
  g.device.popErrorScope.mockReturnValueOnce(
    new Promise((resolve) => {
      release = () => resolve(null);
    }),
  );
  const pending = frame.resize(191, 129);
  await expect(frame.resize(255, 127)).rejects.toThrow("already pending");
  frame.dispose();
  release();
  await expect(pending).rejects.toThrow("disposed");
  expect(g.live.size).toBe(0);
});

test("frame construction releases camera and attachments when nested post allocation fails", () => {
  const g = gpu();
  g.fail(10);
  expect(() => new RawBattleFrame(g.native, environment, 127, 95, 4, "rgba16float")).toThrow(
    "injected",
  );
  expect(g.live.size).toBe(0);
});

test("resize republishes the latest camera/grade at the new physical size", async () => {
  const g = gpu(),
    frame = new RawBattleFrame(g.native, environment, 127, 95, 1, "rgba16float");
  const snapshot = {
    camera3d: {
      target: [0, 0, 0] as [number, number, number],
      distance: 100,
      pitch: 0.6,
      yaw: 0,
      fovY: 1,
      aspect: 1,
      near: 0.1,
    },
    x: 0,
    y: 0,
    zoom: 2,
    width: 127,
    height: 95,
    sunAzimuth: 0,
    sunElevation: 0.6,
  };
  const grade = { strength: 1, saturationBoost: 1, contrast: 0.2, splitTone: 0.3, shadowLift: 1 };
  frame.setCamera(snapshot, [0, 0, 0], grade);
  let release!: () => void;
  g.device.popErrorScope.mockReturnValueOnce(
    new Promise((resolve) => {
      release = () => resolve(null);
    }),
  );
  const pending = frame.resize(191, 129);
  snapshot.x = 42;
  grade.strength = 0.4;
  frame.setCamera(snapshot, [42, 0, 0], grade);
  snapshot.x = -7;
  grade.strength = 99;
  release();
  await pending;
  const writes = g.device.queue.writeBuffer.mock.calls;
  const camera = writes.at(-1)![2] as Float32Array;
  const retainedGrade = writes.at(-2)![2] as Float32Array;
  expect([camera[36], camera[38], camera[39]]).toEqual([42, 191, 129]);
  expect(retainedGrade[0]).toBeCloseTo(0.4);
  frame.dispose();
  expect(g.live.size).toBe(0);
});
