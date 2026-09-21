// @vitest-environment node
import { vi, test, expect, beforeEach } from "vitest";
const state = vi.hoisted(() => ({
  live: new Set<object>(),
  post: vi.fn(),
  cameraWrites: vi.fn(),
  encode: vi.fn(),
  failGroup: false,
}));
vi.mock("../../../packages/battle-renderer/src/world/post", () => ({
  createTypegpuPost: state.post,
}));
vi.mock("typegpu", async (original) => {
  const actual = await original<typeof import("typegpu")>();
  // TypeGPU resources answer for themselves: a texture keeps the props it was
  // created with and reports its own destroyed flag, which is what the frame
  // reads back instead of remembering a descriptor beside them.
  const allocate = (props: unknown) => {
    const value = {
      props,
      destroyed: false,
      $usage: () => value,
      destroy: () => {
        value.destroyed = true;
        state.live.delete(value);
      },
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
import { TypegpuBattleFrame } from "../../../packages/battle-renderer/src/world/frame";
import type { TypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
import type { TgpuCommandEncoder } from "typegpu";
import { BATTLE_DEPTH_ATTACHMENT } from "../../../packages/battle-renderer/src/worldDepth";
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
/** The descriptor the frame hands the render pass, with the attachment views as
 *  the texture objects it installed. */
const encodeOnce = (frame: TypegpuBattleFrame) => {
  let descriptor!: Parameters<TgpuCommandEncoder["beginRenderPass"]>[0];
  const encoder = {
    beginRenderPass: (passed: typeof descriptor) => {
      descriptor = passed;
      return { end: vi.fn() };
    },
  };
  frame.encode(encoder as unknown as TgpuCommandEncoder, {} as GPUTextureView, () => {}, true);
  return descriptor;
};
const textureProps = (view: unknown) =>
  (view as { props: { size: number[]; format: GPUTextureFormat; sampleCount?: number } }).props;
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

test.each([1, 4] as const)(
  "the depth attachment the pass clears is the shared battle policy at %ix",
  async (samples) => {
    const frame = await TypegpuBattleFrame.create(
      device,
      environment,
      128,
      96,
      samples,
      "rgba8unorm",
    );
    const pass = encodeOnce(frame);
    // The descriptor also admits a single attachment; the frame submits a list.
    const attachments = pass.colorAttachments;
    const color = (Array.isArray(attachments) ? attachments[0] : attachments)!;
    const depth = pass.depthStencilAttachment!;
    // 1x draws straight into the sampled HDR target; 4x draws into its own
    // multisampled colour and resolves into it. Depth is neither of them.
    if (samples === 1) {
      expect(color.view).toBe(frame.hdr);
      expect(color.resolveTarget).toBeUndefined();
    } else {
      expect(color.view).not.toBe(frame.hdr);
      expect(color.resolveTarget).toBe(frame.hdr);
    }
    expect(depth.view).not.toBe(color.view);
    // The allocated buffer, not a constant beside it: TypeGPU holds these props.
    expect(textureProps(depth.view)).toEqual({
      size: [128, 96],
      format: BATTLE_DEPTH_ATTACHMENT.format,
      sampleCount: samples,
    });
    expect(depth.depthClearValue).toBe(BATTLE_DEPTH_ATTACHMENT.clearValue);
    expect(depth.depthLoadOp).toBe(BATTLE_DEPTH_ATTACHMENT.loadOp);
    expect(depth.depthStoreOp).toBe(BATTLE_DEPTH_ATTACHMENT.storeOp);
    // Published diagnostics describe that same pass, and say reverse-Z only
    // because the clear and the world compare pair up to it.
    expect(frame.depthStats()).toEqual({
      owner: "typegpu-battle-frame",
      installed: true,
      format: BATTLE_DEPTH_ATTACHMENT.format,
      samples,
      width: 128,
      height: 96,
      clearValue: depth.depthClearValue,
      loadOp: depth.depthLoadOp,
      storeOp: depth.depthStoreOp,
      reversed: true,
      requestedBytes: 128 * 96 * 4 * samples,
    });
    frame.dispose();
  },
);

test("depth stats describe the attachment actually installed across resize, rollback and disposal", async () => {
  const frame = await TypegpuBattleFrame.create(device, environment, 128, 96, 1, "rgba8unorm");
  const reported = () => {
    const { width, height, samples, requestedBytes, installed } = frame.depthStats();
    return { width, height, samples, requestedBytes, installed };
  };
  expect(reported()).toEqual({
    width: 128,
    height: 96,
    samples: 1,
    requestedBytes: 128 * 96 * 4,
    installed: true,
  });
  await frame.resize(192, 128);
  expect(reported()).toEqual({
    width: 192,
    height: 128,
    samples: 1,
    requestedBytes: 192 * 128 * 4,
    installed: true,
  });
  // The reinstalled buffer is the one the pass now clears, not a stale view.
  expect(textureProps(encodeOnce(frame).depthStencilAttachment!.view)).toEqual({
    size: [192, 128],
    format: BATTLE_DEPTH_ATTACHMENT.format,
    sampleCount: 1,
  });
  // A rolled-back resize never becomes the reported attachment.
  state.post.mockRejectedValueOnce(Error("post admission failed"));
  await expect(frame.resize(256, 192)).rejects.toThrow("post admission failed");
  expect(reported()).toEqual({
    width: 192,
    height: 128,
    samples: 1,
    requestedBytes: 192 * 128 * 4,
    installed: true,
  });
  // Disposal releases the buffer, so the diagnostics stop charging for it.
  frame.dispose();
  expect(reported()).toEqual({
    width: 192,
    height: 128,
    samples: 1,
    requestedBytes: 0,
    installed: false,
  });
});
