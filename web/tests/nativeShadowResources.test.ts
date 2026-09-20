// @vitest-environment node
// The raw sun-shadow OWNER: what each mode allocates, how many caster passes it
// encodes and against which layer, what the receiver shader it publishes may
// read, and that a failed allocation or a disposal leaves nothing behind.
import { afterEach, expect, test, vi } from "vitest";
import { RawSunShadow } from "../../packages/battle-renderer/src/world/shadow";
import { rawEnvironmentWgsl } from "../../packages/battle-renderer/src/world/environment";
import {
  SUN_SHADOW_BLOCK_FLOATS,
  sunShadowSampleWgsl,
} from "../../packages/battle-renderer/src/shaders/shadow";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import {
  CSM_CASCADES,
  CSM_MAP_SIZE,
  SINGLE_MAP_SIZE,
} from "@packages/game-renderer/src/battle/shadowPolicy";
import { PHOTOREAL_FAR_FALLBACK } from "@packages/photoreal-renderer/src/cameraBridge";
import type { Camera3DParams } from "@packages/renderer-core/src/camera3d";

const environment = CIVSIM_ENVIRONMENTS.golden;
const camera: Camera3DParams = {
  target: [0, 0, 0],
  distance: 220,
  pitch: 0.6,
  yaw: 0.4,
  fovY: 0.85,
  aspect: 1.6,
  near: 1,
  far: PHOTOREAL_FAR_FALLBACK,
};

afterEach(() => vi.unstubAllGlobals());

function gpu() {
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 1, COPY_DST: 2 });
  vi.stubGlobal("GPUTextureUsage", { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, COPY_SRC: 4 });
  const live = new Set<object>();
  const textures: GPUTextureDescriptor[] = [];
  const buffers: GPUBufferDescriptor[] = [];
  const views: GPUTextureViewDescriptor[] = [];
  const passes: GPURenderPassDescriptor[] = [];
  const writes: { buffer: object; bytes: number }[] = [];
  let allocations = 0;
  let failAt = Infinity;
  const track = <T extends object>(value: T): T => {
    if (++allocations === failAt) throw Error("injected allocation failure");
    live.add(value);
    return value;
  };
  const device = {
    createTexture: (descriptor: GPUTextureDescriptor) => {
      textures.push(descriptor);
      const texture: { destroy(): void; createView(d?: GPUTextureViewDescriptor): object } = {
        destroy: () => live.delete(texture),
        createView: (d?: GPUTextureViewDescriptor) => {
          views.push(d ?? {});
          return { view: d };
        },
      };
      return track(texture);
    },
    createBuffer: (descriptor: GPUBufferDescriptor) => {
      buffers.push(descriptor);
      const buffer = { descriptor, destroy: () => live.delete(buffer) };
      return track(buffer);
    },
    createSampler: () => ({}),
    queue: {
      writeBuffer: (buffer: object, _offset: number, data: Float32Array) =>
        writes.push({ buffer, bytes: data.byteLength }),
    },
    createCommandEncoder: () => ({
      beginRenderPass: (descriptor: GPURenderPassDescriptor) => {
        passes.push(descriptor);
        return { end: vi.fn() };
      },
    }),
  };
  return {
    native: device as unknown as GPUDevice,
    encoder: () => device.createCommandEncoder() as unknown as GPUCommandEncoder,
    live,
    textures,
    buffers,
    views,
    passes,
    writes,
    fail: (offset: number) => {
      failAt = allocations + offset;
    },
  };
}

test("the fitted single map allocates one 1024 layer and High two 2048 layers", () => {
  for (const [mode, size, layers] of [
    ["single", SINGLE_MAP_SIZE, 1],
    ["csm", CSM_MAP_SIZE, CSM_CASCADES],
  ] as const) {
    const g = gpu();
    const shadow = new RawSunShadow(g.native, environment, mode);
    expect(g.textures).toHaveLength(1);
    expect(g.textures[0].size).toEqual([size, size, layers]);
    expect(g.textures[0].format).toBe("depth32float");
    // One distinct caster camera per layer, plus the single receiver block.
    expect(g.buffers.map((b) => b.size)).toEqual([
      ...Array(layers).fill(192),
      SUN_SHADOW_BLOCK_FLOATS * 4,
    ]);
    expect(shadow.cameras).toHaveLength(layers);
    expect(new Set(shadow.cameras).size).toBe(layers);
    expect(shadow.stats()).toMatchObject({
      mode,
      mapSize: size,
      layers,
      depthBytes: size * size * 4 * layers,
      cameraBuffers: layers,
      receiverBytes: 208,
    });
    // Attachments are per-layer 2d views; receivers bind the whole array.
    const layerViews = g.views.filter((v) => v.dimension === "2d");
    expect(layerViews.map((v) => v.baseArrayLayer)).toEqual([...Array(layers).keys()]);
    expect(layerViews.every((v) => v.arrayLayerCount === 1)).toBe(true);
    expect(g.views.filter((v) => v.dimension === "2d-array")).toHaveLength(1);
    shadow.dispose();
    expect(g.live.size).toBe(0);
  }
});

test("High is 32 MiB of depth before backend overhead", () => {
  const g = gpu();
  const shadow = new RawSunShadow(g.native, environment, "csm");
  expect(shadow.stats().depthBytes).toBe(32 * 1024 * 1024);
  shadow.dispose();
});

test("each active cascade gets its own clear-to-0 pass, layer and camera index", () => {
  const g = gpu();
  const shadow = new RawSunShadow(g.native, environment, "csm");
  // Cold: no fit yet, so nothing is drawn against an unfitted box.
  shadow.encode(g.encoder(), () => {
    throw Error("a cold frame must not draw casters");
  });
  expect(g.passes).toHaveLength(0);

  shadow.update(camera);
  const drawn: number[] = [];
  shadow.encode(g.encoder(), (_pass, cascade) => drawn.push(cascade));
  expect(drawn).toEqual([0, 1]);
  expect(g.passes).toHaveLength(CSM_CASCADES);
  g.passes.forEach((descriptor, layer) => {
    const attachment = descriptor.depthStencilAttachment!;
    expect(attachment.depthClearValue).toBe(0);
    expect(attachment.depthLoadOp).toBe("clear");
    expect((attachment.view as unknown as { view: GPUTextureViewDescriptor }).view).toMatchObject({
      baseArrayLayer: layer,
      arrayLayerCount: 1,
    });
  });
  shadow.dispose();
});

test("every cascade camera buffer is written separately before a submission", () => {
  const g = gpu();
  const shadow = new RawSunShadow(g.native, environment, "csm");
  g.writes.length = 0;
  shadow.update(camera);
  const cameraWrites = g.writes.filter((write) => write.bytes === 192);
  expect(cameraWrites).toHaveLength(CSM_CASCADES);
  expect(new Set(cameraWrites.map((write) => write.buffer)).size).toBe(CSM_CASCADES);
  expect(g.writes.filter((write) => write.bytes === 208)).toHaveLength(1);
  // An unchanged camera re-uploads nothing.
  g.writes.length = 0;
  shadow.update({ ...camera });
  expect(g.writes).toHaveLength(0);
  shadow.dispose();
});

test("a failed allocation destroys what it already took and stays disposed", () => {
  for (let offset = 1; offset <= 4; offset++) {
    const g = gpu();
    g.fail(offset);
    expect(() => new RawSunShadow(g.native, environment, "csm")).toThrow("injected");
    expect(g.live.size).toBe(0);
  }
  const g = gpu();
  const shadow = new RawSunShadow(g.native, environment, "single");
  shadow.dispose();
  shadow.dispose();
  expect(g.live.size).toBe(0);
  expect(() => shadow.update(camera)).toThrow("disposed");
  expect(() => shadow.setWorldRect([0, 0, 10, 10])).toThrow("disposed");
  expect(() => shadow.encode(g.encoder(), () => {})).toThrow("disposed");
});

test("the single receiver shader never names a second cascade or a second layer", () => {
  const single = sunShadowSampleWgsl("single", "cascade-array");
  expect(single).toContain("sunShadow.cascades[0]");
  expect(single).not.toContain("cascades[1]");
  expect(single).toMatch(/shadowVisibility\(sunDepth,sunCompare,0,/);
  // No blend, no view row, no near-plane read: the sole map is sampled directly.
  expect(single).not.toContain("worldToView");
  expect(single).not.toContain("cam.znear");
});

test("the High receiver shader reads the shared view row and near plane, and both cascades", () => {
  const high = sunShadowSampleWgsl("csm", "cascade-array");
  expect(high).toContain("environment.worldToView");
  expect(high).toContain("cam.znear");
  expect(high).toContain("sunShadow.control.x");
  for (const layer of [0, 1]) expect(high).toContain(`sunShadow.cascades[${layer}]`);
  expect(high).toMatch(/shadowVisibility\(sunDepth,sunCompare,0,/);
  expect(high).toMatch(/shadowVisibility\(sunDepth,sunCompare,1,/);
  // The last cascade does not widen its far edge, so it fades to unshadowed.
  expect(high.match(/interval\.y\+margin\*0\.5/g)).toHaveLength(1);
  // A zero-width band cannot divide by zero.
  expect(high).toContain("margin>0.0");
});

test("both world shadow shaders bind the cascade array and one receiver block", () => {
  for (const mode of ["single", "csm"] as const) {
    const shader = rawEnvironmentWgsl(environment, undefined, mode);
    expect(shader).toContain("var sunDepth:texture_depth_2d_array");
    expect(shader).toContain("struct SunShadow {cascades:array<SunCascade,2>,control:vec4f}");
    expect(shader).toContain("fn sampleSunShadow");
  }
  // Off publishes no shadow bindings at all.
  const off = rawEnvironmentWgsl(environment, undefined, null);
  expect(off).not.toContain("sunDepth");
  expect(off).not.toContain("sampleSunShadow");
});
