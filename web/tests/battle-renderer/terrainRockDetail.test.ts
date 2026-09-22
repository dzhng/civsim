// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { tgpu } from "typegpu";
import { recordingGpu } from "./recordingDevice";
import { loadTypegpuRockDetail } from "../../../packages/battle-renderer/src/world/rockDetail";
import { createTypegpuTerrain } from "../../../packages/battle-renderer/src/world/terrain";
import { createTypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
import { Camera } from "../../../packages/battle-renderer/src/world/camera";
import { CIVSIM_ENVIRONMENTS } from "../../../packages/game-renderer/src/environment/environment";
const state = vi.hoisted(() => ({ close: vi.fn() }));
vi.mock("../../../packages/game-renderer/src/terrain/rockDetail", () => ({
  decodeRockDetail: async () => ({
    width: 4,
    height: 4,
    data: new Uint8Array(64).fill(128),
    close: state.close,
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  state.close.mockReset();
});
function device() {
  const g = recordingGpu();
  const bound: GPUBindGroup[] = [];
  const samplers: GPUSamplerDescriptor[] = [];
  g.native.createSampler = (descriptor = {}) => {
    samplers.push(descriptor);
    return {} as GPUSampler;
  };
  const encoder = g.native.createCommandEncoder.bind(g.native);
  g.native.createCommandEncoder = (...args) => {
    const result = encoder(...args),
      begin = result.beginRenderPass.bind(result);
    result.beginRenderPass = (...passArgs) =>
      Object.assign(begin(...passArgs), {
        setBindGroup: (_index: number, group: GPUBindGroup) => bound.push(group),
        setViewport: vi.fn(),
        setScissorRect: vi.fn(),
        setVertexBuffer: vi.fn(),
        setIndexBuffer: vi.fn(),
        draw: vi.fn(),
        drawIndexed: vi.fn(),
      });
    return result;
  };
  const buffer = g.native.createBuffer.bind(g.native);
  g.native.createBuffer = (descriptor) =>
    Object.assign(buffer(descriptor), {
      mapState: descriptor.mappedAtCreation ? "mapped" : "unmapped",
    });
  const texture = g.native.createTexture.bind(g.native);
  g.native.createTexture = (descriptor) => {
    const result = texture(descriptor);
    const createView = result.createView.bind(result);
    return Object.assign(result, {
      createView: (viewDescriptor?: GPUTextureViewDescriptor) =>
        Object.assign(createView(viewDescriptor), { sourceTexture: result }),
      width: (descriptor.size as number[])[0],
      height: (descriptor.size as number[])[1],
      format: descriptor.format,
    });
  };
  return { ...g, bound, samplers };
}

test.each([undefined, "vista", "farFog"] as const)(
  "terrain band %s samples borrowed linear mipmapped rock detail with repeat filtering",
  async (vistaBand) => {
    const g = device(),
      root = tgpu.initFromDevice({ device: g.native });
    const camera = root.createBuffer(Camera).$usage("uniform");
    const environment = await createTypegpuEnvironment(g.native, CIVSIM_ENVIRONMENTS.golden);
    const rock = await loadTypegpuRockDetail(g.native);
    expect(state.close).toHaveBeenCalledTimes(1);
    expect(rock.stats).toEqual({ width: 4, height: 4, mipLevels: 3, bytes: 84 });
    expect(g.textures).toContainEqual(
      expect.objectContaining({ format: "rgba8unorm", mipLevelCount: 3 }),
    );
    const ground = {
      triangles: 1,
      vertices: new Float32Array(30),
      coverage: new Float32Array(9),
      surfaceColor: new Float32Array(9),
      indices: new Uint32Array([0, 1, 2]),
    };
    const firstShader = g.shaders.length;
    const terrain = await createTypegpuTerrain(
      g.native,
      root.unwrap(camera),
      environment,
      rock,
      ground,
      null,
      { slopeBands: null, vistaBand },
    );
    const shader = g.shaders.slice(firstShader).find((code) => code.includes("faceSample"))!;
    expect(shader).toBeTruthy();
    expect(shader).toContain("rockPosition.yz");
    expect(shader).toContain("rockPosition.xz");
    expect(shader).toContain("rockPosition.xy");
    expect(shader).toContain("fwidth(position)");
    // Authored cover ids are prop footprints, but normals still receive visual slopes.
    expect(shader).toContain("let sourceRock=0.0");
    expect(shader).toContain("let sourceScree=0.0");
    expect(shader).toContain("let slopeRock=1.0-smoothstep(");
    g.bound.length = 0;
    const command = g.encoder(),
      pass = command.beginRenderPass({ colorAttachments: [] });
    terrain.draw(pass);
    pass.end();
    const image = g.unwrap(rock.texture);
    expect(
      g.bound.some((group) =>
        [...(group as unknown as { descriptor: GPUBindGroupDescriptor }).descriptor.entries].some(
          (entry) => (entry.resource as { sourceTexture?: unknown }).sourceTexture === image,
        ),
      ),
    ).toBe(true);
    expect(g.samplers).toContainEqual(
      expect.objectContaining({
        addressModeU: "repeat",
        addressModeV: "repeat",
        mipmapFilter: "linear",
      }),
    );
    terrain.dispose();
    expect(g.live.has(image)).toBe(true);
    rock.dispose();
    environment.dispose();
    camera.destroy();
    root.destroy();
    expect(g.live.size).toBe(0);
  },
);

test("failed image admission closes decoded data and frees the mip texture", async () => {
  const g = device();
  const pop = g.native.popErrorScope.bind(g.native);
  let failed = false;
  g.native.popErrorScope = async () => {
    await pop();
    if (!failed) {
      failed = true;
      return { message: "image rejected" } as GPUError;
    }
    return null;
  };
  await expect(loadTypegpuRockDetail(g.native)).rejects.toThrow("image rejected");
  expect(state.close).toHaveBeenCalledTimes(1);
  expect(g.live.size).toBe(0);
});
