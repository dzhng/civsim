/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
// The TypeGPU sun-shadow OWNER, against a recording device: what each mode
// actually allocates through the typed root, how many caster passes it encodes
// and against which layer, what the typed receiver block measures, and that a
// failed allocation or a disposal leaves nothing behind. The raw owner's
// resource test (web/tests/nativeShadowResources.test.ts) is the reference —
// the contract is the same, the resources are typed.
import { afterEach, expect, test, vi } from "vitest";
import { attachedLayer, recordingGpu } from "./recordingDevice";
import { d } from "typegpu";
import {
  SunCascade,
  SunShadow,
  createTypegpuSunShadow,
  sunShadowSampleBodyWgsl,
} from "../../../../../packages/battle-renderer/src/world/shadow";
import {
  SUN_CASCADE_RECORD_FLOATS,
  SUN_SHADOW_BLOCK_FLOATS,
  sunShadowSampleWgsl,
} from "../../../../../packages/battle-renderer/src/shaders/shadow";
import { CIVSIM_ENVIRONMENTS } from "../../../../../packages/game-renderer/src/environment/environment";
import {
  CSM_CASCADES,
  CSM_MAP_SIZE,
  SINGLE_MAP_SIZE,
} from "../../../../../packages/game-renderer/src/battle/shadowPolicy";
import {
  FINITE_CAMERA_FAR_FALLBACK,
  type Camera3DParams,
} from "../../../../../packages/renderer-core/src/camera3d";

const environment = CIVSIM_ENVIRONMENTS.golden;
const camera: Camera3DParams = {
  target: [0, 0, 0],
  distance: 220,
  pitch: 0.6,
  yaw: 0.4,
  fovY: 0.85,
  aspect: 1.6,
  near: 1,
  far: FINITE_CAMERA_FAR_FALLBACK,
};

afterEach(() => vi.unstubAllGlobals());

const gpu = recordingGpu;

test("the typed receiver schema measures the shared block, record for record", () => {
  expect(d.sizeOf(SunCascade)).toBe(SUN_CASCADE_RECORD_FLOATS * 4);
  expect(d.sizeOf(SunShadow)).toBe(SUN_SHADOW_BLOCK_FLOATS * 4);
  expect(SunShadow.propTypes.cascades.elementCount).toBe(CSM_CASCADES);
});

test("the fitted single map allocates one 1024 layer and High two 2048 layers", () => {
  for (const [mode, size, layers] of [
    ["single", SINGLE_MAP_SIZE, 1],
    ["csm", CSM_MAP_SIZE, CSM_CASCADES],
  ] as const) {
    const g = gpu();
    const shadow = createTypegpuSunShadow(g.native, environment, mode);
    // A cold owner has committed nothing but the receiver block it publishes.
    expect(g.buffers.map((b) => b.size)).toEqual([SUN_SHADOW_BLOCK_FLOATS * 4]);
    shadow.setWorldRect([-100, -100, 200, 200]);
    shadow.update(camera);
    shadow.encode(g.encoder(), () => {});
    // One depth array sized by the mode, never one texture per cascade.
    expect(g.textures).toHaveLength(1);
    expect(g.textures[0].size).toEqual([size, size, layers]);
    expect(g.textures[0].format).toBe("depth32float");
    // One distinct caster camera per layer, plus the single receiver block.
    expect(g.buffers.map((b) => b.size).sort()).toEqual(
      [...Array(layers).fill(192), SUN_SHADOW_BLOCK_FLOATS * 4].sort(),
    );
    expect(shadow.cameras).toHaveLength(layers);
    expect(new Set(shadow.cameras).size).toBe(layers);
    expect(shadow.cameraGroups).toHaveLength(layers);
    expect(new Set(shadow.cameraGroups).size).toBe(layers);
    expect(shadow.depth.props.size).toEqual([size, size, layers]);
    expect(shadow.stats()).toMatchObject({
      mode,
      cascades: layers,
      mapSize: size,
      layers,
      depthBytes: size * size * 4 * layers,
      cameraBuffers: layers,
      receiverBytes: 208,
    });
    shadow.dispose();
    expect(g.live.size).toBe(0);
  }
});

test("High is 32 MiB of depth before backend overhead", () => {
  const g = gpu();
  const shadow = createTypegpuSunShadow(g.native, environment, "csm");
  expect(shadow.stats().depthBytes).toBe(32 * 1024 * 1024);
  shadow.dispose();
});

test("each active cascade gets its own clear-to-0 pass, layer and camera index", () => {
  const g = gpu();
  const shadow = createTypegpuSunShadow(g.native, environment, "csm");
  // Cold: no fit yet, so nothing is drawn against an unfitted box.
  shadow.encode(g.encoder(), () => {
    throw Error("a cold frame must not draw casters");
  });
  expect(g.passes).toHaveLength(0);
  expect(g.textures).toHaveLength(0);

  shadow.update(camera);
  const drawn: number[] = [];
  shadow.encode(g.encoder(), (_pass, cascade) => drawn.push(cascade));
  expect(drawn).toEqual([0, 1]);
  expect(g.passes).toHaveLength(CSM_CASCADES);
  // One depth array, never one texture per cascade.
  expect(g.textures).toHaveLength(1);
  expect(g.textures[0].size).toEqual([CSM_MAP_SIZE, CSM_MAP_SIZE, CSM_CASCADES]);
  g.passes.forEach((descriptor, layer) => {
    const attachment = descriptor.depthStencilAttachment!;
    expect(attachment.depthClearValue).toBe(0);
    expect(attachment.depthLoadOp).toBe("clear");
    // A depth attachment is a SINGLE layer of the array — never the array view,
    // which no depth-stencil attachment is allowed to be.
    expect(attachedLayer(descriptor)).toEqual({
      label: expect.anything(),
      baseArrayLayer: layer,
      arrayLayerCount: 1,
    });
  });
  shadow.dispose();
});

test("the receiver binds one 2d-array view of the same depth array in both modes", () => {
  for (const mode of ["single", "csm"] as const) {
    const g = gpu();
    const shadow = createTypegpuSunShadow(g.native, environment, mode);
    expect(shadow.receiverView.schema.type).toBe("texture_depth_2d_array");
    // Materialized: the ONE view the device is asked for on the receiver side
    // spans the whole array, and it is a view of the sole depth texture rather
    // than a second allocation — in the fitted single mode as much as in High.
    g.unwrap(shadow.samplingGroup);
    expect(g.views.filter((view) => view.dimension === "2d-array")).toHaveLength(1);
    expect(g.textures).toHaveLength(1);
    shadow.dispose();
  }
});

test("every cascade camera buffer is written separately before a submission", () => {
  const g = gpu();
  const shadow = createTypegpuSunShadow(g.native, environment, "csm");
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
  // The cold receiver block is the owner's first device commitment; failing it
  // must leave no live resource behind.
  const cold = gpu();
  cold.failBufferAt(1);
  expect(() => createTypegpuSunShadow(cold.native, environment, "csm")).toThrow("injected");
  expect(cold.live.size).toBe(0);
  // The caster cameras are committed by the first fit. A failure there leaves a
  // live owner whose disposal still releases everything it did take.
  for (let index = 2; index <= CSM_CASCADES + 1; index++) {
    const g = gpu();
    g.failBufferAt(index);
    const shadow = createTypegpuSunShadow(g.native, environment, "csm");
    expect(() => shadow.update(camera)).toThrow("injected");
    shadow.dispose();
    expect(g.live.size).toBe(0);
  }
  const g = gpu();
  const shadow = createTypegpuSunShadow(g.native, environment, "single");
  shadow.dispose();
  shadow.dispose();
  expect(g.live.size).toBe(0);
  expect(() => shadow.update(camera)).toThrow("disposed");
  expect(() => shadow.setWorldRect([0, 0, 10, 10])).toThrow("disposed");
  expect(() => shadow.encode(g.encoder(), () => {})).toThrow("disposed");
});

test("the re-headed sampler carries the shared body verbatim onto typed resources", () => {
  for (const mode of ["single", "csm"] as const) {
    const shared = sunShadowSampleWgsl(mode, "cascade-array");
    const typed = sunShadowSampleBodyWgsl(mode);
    // Signature synthesized, body inherited: the shared text after its own head
    // is carried through character for character.
    expect(typed).toContain(
      "(environment:Environment,cam:Camera,sunShadow:SunShadow,sunDepth:texture_depth_2d_array,sunCompare:sampler_comparison,world:vec3f,normal:vec3f,pixel:vec2f)->f32 {",
    );
    expect(typed.endsWith(shared.slice(shared.indexOf("{") + 1))).toBe(true);
    expect(typed).not.toContain("fn sampleSunShadow");
  }
  // High still blends both cascades against the shared view row and near plane.
  const high = sunShadowSampleBodyWgsl("csm");
  expect(high).toContain("environment.worldToView");
  expect(high).toContain("cam.znear");
  expect(high).toContain("sunShadow.control.x");
  for (const layer of [0, 1]) expect(high).toContain(`sunShadow.cascades[${layer}]`);
  // The fitted single map samples its sole record directly — no blend.
  const single = sunShadowSampleBodyWgsl("single");
  expect(single).toContain("sunShadow.cascades[0]");
  expect(single).not.toContain("cascades[1]");
  expect(single).not.toContain("worldToView");
});
