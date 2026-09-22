// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { tgpu } from "typegpu";
import { recordingGpu } from "./recordingDevice";
import { createTypegpuScenery } from "../../../packages/battle-renderer/src/world/scenery";
import { createTypegpuEnvironment } from "../../../packages/battle-renderer/src/world/environment";
import { Camera, typegpuCameraLayout } from "../../../packages/battle-renderer/src/world/camera";
import { CIVSIM_ENVIRONMENTS } from "../../../packages/game-renderer/src/environment/environment";

afterEach(() => vi.unstubAllGlobals());

test("scenery shadow fragments consume the same leaf atlas and cutout as visible fragments", async () => {
  const g = recordingGpu();
  // Exercise real TypeGPU pipeline resolution and binding through a recording
  // render pass. This device cannot rasterize; visual coverage is a browser gate.
  const bound: GPUBindGroup[] = [];
  const encoder = g.native.createCommandEncoder.bind(g.native);
  g.native.createCommandEncoder = (...args) => {
    const result = encoder(...args);
    const begin = result.beginRenderPass.bind(result);
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
  const createBuffer = g.native.createBuffer.bind(g.native);
  g.native.createBuffer = (descriptor) =>
    Object.assign(createBuffer(descriptor), {
      mapState: descriptor.mappedAtCreation ? "mapped" : "unmapped",
    });
  const createTexture = g.native.createTexture.bind(g.native);
  g.native.createTexture = (descriptor) => {
    const size = descriptor.size as number[];
    return Object.assign(createTexture(descriptor), {
      width: size[0],
      height: size[1],
      format: descriptor.format,
    });
  };
  const root = tgpu.initFromDevice({ device: g.native });
  const cameraBuffer = root.createBuffer(Camera).$usage("uniform");
  const camera = root.createBindGroup(typegpuCameraLayout, { cam: cameraBuffer });
  const environment = await createTypegpuEnvironment(g.native, CIVSIM_ENVIRONMENTS.golden);
  const before = g.shaders.length;
  const scenery = await createTypegpuScenery(g.native, camera, environment, 1);
  const shaderBodies = g.shaders.slice(before);
  const beauty = shaderBodies.find(
    (code) => code.includes("geometryNormalView") && !code.includes("@builtin(frag_depth)"),
  )!;
  const shadow = shaderBodies.find((code) => code.includes("@builtin(frag_depth)"))!;
  expect(beauty).toBeTruthy();
  expect(shadow).toBeTruthy();
  // Resolve both actual consumers: the shadow must sample alpha, including the
  // negative-UV opaque geometry exemption, instead of only vertex alpha.
  for (const code of [beauty, shadow]) {
    expect(code).toContain("textureSample(");
    expect(code).toContain("step(0.0,v.uv.x)");
    expect(code).toContain("v.color.a*mix(1.0,texel.a*v.presence,mask)");
    expect(code).toContain("if(alpha<=0.5){discard;}");
  }
  await scenery.upload([
    { kind: "broadleaf", x: 0, y: 0, size: 1 },
    { kind: "broadleaf", x: 2, y: 0, size: 0.001 },
  ]);
  const projection = {
    view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1],
    pixelsPerViewUnit: 10000,
    perspective: true,
    near: 0.1,
  };
  const initialAllocations = g.buffers.length;
  scenery.prepare(projection);
  expect(g.buffers.length).toBe(initialAllocations);
  expect(scenery.stats().sceneryDetailed).toBe(1);
  const allocations = g.buffers.length,
    writes = g.writes.length;
  scenery.prepare(projection);
  expect(g.writes.length).toBe(writes);
  scenery.prepare({ ...projection, pixelsPerViewUnit: 1 });
  expect(scenery.stats().sceneryDetailed).toBe(0);
  expect(scenery.stats().scenery).toBe(2);
  scenery.prepare(projection);
  expect(scenery.stats().sceneryDetailed).toBe(1);
  expect(g.buffers.length).toBe(allocations);
  const draw = (audience: "main" | "shadow") => {
    bound.length = 0;
    const command = g.encoder();
    const pass = command.beginRenderPass({ colorAttachments: [] });
    scenery.draw(pass, camera, audience);
    pass.end();
    return [...bound];
  };
  const visibleGroups = draw("main");
  const shadowGroups = draw("shadow");
  // One atlas/sampler group is reused, not a shadow-only texture or sampler.
  const leafGroup = visibleGroups.find((group) => {
    const entries = (group as unknown as { descriptor: GPUBindGroupDescriptor }).descriptor.entries;
    return [...entries].length === 2;
  });
  expect(leafGroup).toBeDefined();
  expect(shadowGroups).toContain(leafGroup);
  g.failBufferAt(g.buffers.length + 2);
  await expect(
    scenery.upload(
      Array.from({ length: 4 }, (_, i) => ({ kind: "broadleaf" as const, x: i, y: 0, size: 1 })),
    ),
  ).rejects.toThrow("injected allocation failure");
  scenery.dispose();
  environment.dispose();
  cameraBuffer.destroy();
  root.destroy();
  expect(g.live.size).toBe(0);
});
