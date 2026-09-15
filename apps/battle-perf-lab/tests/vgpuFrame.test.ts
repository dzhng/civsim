/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
const state = vi.hoisted(() => ({
  live: new Set<object>(),
  targets: vi.fn(),
  post: vi.fn(),
  events: [] as string[],
}));
const allocate = vi.hoisted(() => (extra: object = {}) => {
  const value = { ...extra, destroy: () => state.live.delete(value) };
  state.live.add(value);
  return value;
});
vi.mock("vgpu", () => ({
  target: () => {
    state.targets();
    return allocate({ color: { gpu: { createView: () => ({}) } } });
  },
  frame: (_gpu: object, callback: (value: object) => void) => {
    callback({
      pass: (_options: object, draw: (pass: object) => void) => {
        state.events.push("world");
        draw({});
      },
    });
    return { done: Promise.resolve() };
  },
}));
vi.mock("../src/vgpu/post", () => ({
  createVgpuPost: (...args: unknown[]) => state.post(...args),
}));
import { VgpuBattleFrame } from "../src/vgpu/frame";
function post() {
  const resource = allocate();
  return {
    setGrade: vi.fn(),
    encode: (_f: object, _o: object, _b: boolean, enabled: boolean) =>
      state.events.push(`post:${enabled}`),
    dispose: resource.destroy,
  };
}
const create = () => {
  const gpu = {
    device: {
      gpu: { pushErrorScope() {}, popErrorScope: () => Promise.resolve(null) },
      createBuffer: () => allocate({ write: vi.fn() }),
    },
  };
  const env = {
    exposure: 1,
    setView() {},
    sky: {
      setRays() {},
      drawBackground() {
        state.events.push("sky");
      },
    },
  };
  return VgpuBattleFrame.create(gpu as never, env as never, 127, 95, 4, "rgba16float");
};
beforeEach(() => {
  state.live.clear();
  state.events.length = 0;
  vi.resetAllMocks();
  state.post.mockImplementation(post);
});
test("resize retains camera identity and same-size calls allocate no resources", async () => {
  const frame = await create(),
    camera = frame.camera,
    hdr = frame.hdr,
    count = state.live.size,
    allocations = state.targets.mock.calls.length;
  await frame.resize(127, 95);
  expect(state.targets).toHaveBeenCalledTimes(allocations);
  await frame.resize(191, 129);
  expect(frame.camera).toBe(camera);
  expect(frame.hdr).not.toBe(hdr);
  expect(state.live.size).toBe(count);
  expect([frame.width, frame.height]).toEqual([191, 129]);
  frame.dispose();
  frame.dispose();
  expect(state.live.size).toBe(0);
});
test("post constructor rejection cleans staged frame and constructor camera", async () => {
  state.post.mockRejectedValueOnce(Error("post admission"));
  await expect(create()).rejects.toThrow("post admission");
  expect(state.live.size).toBe(0);
  const frame = await create(),
    hdr = frame.hdr,
    count = state.live.size;
  state.post.mockRejectedValueOnce(Error("resize admission"));
  await expect(frame.resize(191, 129)).rejects.toThrow("resize admission");
  expect(frame.hdr).toBe(hdr);
  expect(state.live.size).toBe(count);
  frame.dispose();
  expect(state.live.size).toBe(0);
});
test("dispose during pending resize rejects concurrency and cleans both generations before settling", async () => {
  const frame = await create();
  let finish!: (value: ReturnType<typeof post>) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  state.post.mockImplementationOnce(() => {
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = frame.resize(191, 129);
  await started;
  await expect(frame.resize(200, 150)).rejects.toThrow("in flight");
  frame.dispose();
  finish(post());
  await expect(pending).rejects.toThrow("disposed");
  expect(state.live.size).toBe(0);
});
test("render routes before one combined sky/world pass and forwards post bypass", async () => {
  const frame = await create();
  await frame.render(
    {} as never,
    () => state.events.push("route"),
    () => state.events.push("draw"),
    true,
    () => state.events.push("shadow"),
    false,
  );
  expect(state.events).toEqual(["route", "shadow", "world", "sky", "draw", "post:false"]);
  frame.dispose();
});
test("a staged cleanup error cannot skip original frame resources or replace disposal failure", async () => {
  const frame = await create();
  let entered!: () => void, finish!: (value: ReturnType<typeof post>) => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  state.post.mockImplementationOnce(() => {
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = frame.resize(191, 129);
  await started;
  frame.dispose();
  const staged = post();
  finish({
    ...staged,
    dispose() {
      staged.dispose();
      throw Error("staged cleanup");
    },
  });
  const error = await pending.catch((error) => error);
  const messages = (e: Error): string[] =>
    e instanceof AggregateError ? e.errors.flatMap(messages) : [e.message];
  expect(messages(error).join(" ")).toContain("disposed");
  expect(messages(error).join(" ")).toContain("staged cleanup");
  expect(state.live.size).toBe(0);
});
