/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
const state = vi.hoisted(() => ({
  live: new Set<object>(),
  post: vi.fn(),
  cameraWrites: vi.fn(),
  encode: vi.fn(),
  failGroup: false,
}));
vi.mock("../post", () => ({
  createTypegpuPost: state.post,
}));
vi.mock("typegpu", async (original) => {
  const actual = await original<typeof import("typegpu")>();
  const allocate = () => {
    const value = {
      $usage: () => value,
      destroy: () => state.live.delete(value),
      write: state.cameraWrites,
      createView: () => value,
    };
    state.live.add(value);
    return value;
  };
  return {
    ...actual,
    tgpu: {
      ...actual.tgpu,
      initFromDevice: () => ({
        createTexture: allocate,
        createBuffer: allocate,
        createBindGroup: () => {
          if (state.failGroup) throw Error("camera group failed");
          return {};
        },
        unwrap: (v: unknown) => v,
        destroy() {},
      }),
    },
  };
});
import { TypegpuBattleFrame } from "../frame";
import type { TypegpuEnvironment } from "../environment";
import type { TgpuCommandEncoder } from "typegpu";
const device = {
  pushErrorScope() {},
  popErrorScope: vi.fn(async (): Promise<GPUError | null> => null),
} as unknown as GPUDevice;
const environment = {
  exposure: 1,
  setView() {},
  sky: { setRays() {}, encodeBackground() {} },
} as unknown as TypegpuEnvironment;
const post = () => ({ dispose: vi.fn(), setGrade: vi.fn(), encode: state.encode });
beforeEach(() => {
  state.live.clear();
  state.failGroup = false;
  vi.mocked(device.popErrorScope).mockReset().mockResolvedValue(null);
  state.post.mockReset().mockImplementation(async () => post());
  state.encode.mockReset();
});
test("resize stages complete attachments while preserving camera identity, and failure preserves the old frame", async () => {
  const frame = await TypegpuBattleFrame.create(device, environment, 128, 96, 4, "rgba8unorm");
  const camera = frame.cameraBuffer,
    group = frame.cameraGroup,
    hdr = frame.hdr,
    count = state.live.size;
  let resume!: (value: ReturnType<typeof post>) => void;
  state.post.mockReturnValueOnce(
    new Promise((r) => {
      resume = r;
    }),
  );
  const pending = frame.resize(192, 128);
  await Promise.resolve();
  await Promise.resolve();
  expect(frame.hdr).toBe(hdr);
  await expect(frame.resize(256, 128)).rejects.toThrow("pending");
  resume(post());
  await pending;
  expect([frame.width, frame.height]).toEqual([192, 128]);
  expect(frame.cameraBuffer).toBe(camera);
  expect(frame.cameraGroup).toBe(group);
  expect(state.live.has(hdr)).toBe(false);
  expect(state.live.size).toBe(count);
  const committed = frame.hdr;
  state.post.mockRejectedValueOnce(Error("post admission failed"));
  await expect(frame.resize(256, 192)).rejects.toThrow("post admission failed");
  expect(frame.hdr).toBe(committed);
  expect(state.live.size).toBe(count);
  await frame.resize(192, 128);
  expect(frame.hdr).toBe(committed);
  frame.dispose();
  expect(state.live.size).toBe(0);
});
test("disposal during pending resize releases both generations before resize settles", async () => {
  const frame = await TypegpuBattleFrame.create(device, environment, 128, 96, 1, "rgba8unorm");
  let resume!: (value: ReturnType<typeof post>) => void;
  state.post.mockReturnValueOnce(
    new Promise((r) => {
      resume = r;
    }),
  );
  const pending = frame.resize(192, 128);
  await Promise.resolve();
  await Promise.resolve();
  frame.dispose();
  resume(post());
  await expect(pending).rejects.toThrow("disposed");
  expect(state.live.size).toBe(0);
});
test("encode owns no submission and forwards post bypass separately from bloom", async () => {
  const frame = await TypegpuBattleFrame.create(device, environment, 128, 96, 1, "rgba8unorm");
  const encoder = { beginRenderPass: () => ({ end: vi.fn() }), submit: vi.fn() };
  frame.encode(
    encoder as unknown as TgpuCommandEncoder,
    {} as GPUTextureView,
    () => {},
    true,
    false,
  );
  expect(state.encode.mock.calls[0].slice(2)).toEqual([true, false]);
  expect(encoder.submit).not.toHaveBeenCalled();
  frame.dispose();
  expect(state.live.size).toBe(0);
});

test("camera construction and asynchronous admission failure release the camera and attachments", async () => {
  state.failGroup = true;
  await expect(
    TypegpuBattleFrame.create(device, environment, 128, 96, 1, "rgba8unorm"),
  ).rejects.toThrow("camera group failed");
  expect(state.live.size).toBe(0);
  state.failGroup = false;
  let pop = 0;
  vi.mocked(device.popErrorScope).mockImplementation(async () =>
    ++pop === 4 ? ({ message: "camera admission failed" } as GPUError) : null,
  );
  await expect(
    TypegpuBattleFrame.create(device, environment, 128, 96, 1, "rgba8unorm"),
  ).rejects.toThrow("camera admission failed");
  expect(state.live.size).toBe(0);
});
