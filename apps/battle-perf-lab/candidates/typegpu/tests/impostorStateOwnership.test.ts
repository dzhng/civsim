/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
// What the REAL impostor layer makes a device commit, recorded through the production
// path: the bytes a submission costs, the bytes a camera move costs, what the vertex stage
// is actually compiled to consume, and what survives growth and disposal. The crowd mesh
// is the only mocked leaf; every impostor resource here is the one the lab builds.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { tgpu, d } from "typegpu";
import { recordingGpu } from "./recordingDevice";
import { createTypegpuImpostors } from "../../../../../packages/battle-renderer/src/world/impostor";
import { createTypegpuCrowdAudience } from "../../../../../packages/battle-renderer/src/world/crowdAudience";
import {
  ImpostorState,
  ImpostorViewBlock,
} from "../../../../../packages/battle-renderer/src/world/impostorDerivation";
import type { CrowdInstance } from "../../../../../packages/crowd-runtime/src/instanceData";
import type { ImpostorView } from "../../../../../packages/battle-renderer/src/impostorData";
import type { CrowdProjectionView } from "../../../../../packages/crowd-runtime/src/visibility";
import { IMPOSTOR_LEVEL, LOD_COUNT_KEYS } from "../../../../../packages/crowd-runtime/src/lod";

const mesh = vi.hoisted(() => ({
  upload: vi.fn(async () => {}),
  precompute: vi.fn(),
  draw: vi.fn(),
  stats: () => ({}),
  dispose: vi.fn(),
}));
vi.mock("../../../../../packages/battle-renderer/src/world/crowd", () => ({
  createTypegpuCrowd: async () => mesh,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

const STATE_BYTES = 24;
const VIEW_BYTES = 48;
const RECORD_BYTES = 32;
/** A 2x2 atlas: one real mip chain, small enough that the uploads are not the subject. */
function atlasData() {
  const tileSize = 1;
  const columns = 2;
  const rows = 2;
  const levels = Math.floor(Math.log2(columns * tileSize)) + 1;
  const chain = () =>
    Array.from(
      { length: levels },
      (_, mip) =>
        new Uint8Array(
          Math.max(1, (columns * tileSize) >> mip) * Math.max(1, (rows * tileSize) >> mip) * 4,
        ),
    );
  return {
    columns,
    rows,
    tileSize,
    center: [0.1, -0.2, 0.9] as [number, number, number],
    worldSpan: 1.5,
    albedo: chain(),
    normal: chain(),
    orm: chain(),
  };
}
/** The only thing the impostor layer borrows from the environment: a shading entry point
 *  with the native surface arguments, and the group it reads its own block through. */
function stubEnvironment(device: GPUDevice) {
  const root = tgpu.initFromDevice({ device });
  const layout = tgpu.bindGroupLayout({ probe: { uniform: d.vec4f, visibility: ["fragment"] } });
  const shade = tgpu.fn(
    [d.vec3f, d.vec3f, d.f32, d.f32, d.f32, d.f32, d.vec3f, d.vec3f, d.f32, d.vec3f],
    d.vec4f,
  )((base) => {
    "use gpu";
    return d.vec4f(base, layout.$.probe.w);
  });
  return {
    root,
    environment: {
      shade,
      group: root.createBindGroup(layout, { probe: root.createBuffer(d.vec4f).$usage("uniform") }),
    },
  };
}
const build = async (g: ReturnType<typeof recordingGpu>, recordDiagnostics = false) => {
  const { root, environment } = stubEnvironment(g.native);
  const layer = await createTypegpuImpostors(
    g.native,
    atlasData() as never,
    environment as never,
    1,
    recordDiagnostics,
  );
  return { layer, dispose: () => (layer.dispose(), root.destroy()) };
};
/** The buffers one bind group was actually built over, in binding order. */
const bound = (descriptor: GPUBindGroupDescriptor) =>
  [...(descriptor.entries as Iterable<GPUBindGroupEntry>)].map(
    (entry) => (entry.resource as GPUBufferBinding).buffer as unknown as GPUBuffer,
  );

const soldier = (i: number): CrowdInstance => ({
  x: i,
  y: -i,
  facing: i * 0.01,
  classId: 0,
  faction: (i % 2) as 0 | 1,
  alive: true,
  clip: "idle",
  phase: 0,
  seed: i,
  mounted: false,
  lod: 0,
  elevation: i * 0.5,
});
const population = (n: number) => Array.from({ length: n }, (_, i) => soldier(i));
const CAMERA: ImpostorView = { right: [1, 0, 0], up: [0, 0, 1], eye: [3, -10, 4], fovY: 0.8 };
/** The bytes a call made the device commit, and nothing the calls before it did. */
function committed(g: ReturnType<typeof recordingGpu>, act: () => void) {
  const before = g.writes.length;
  act();
  return g.writes.slice(before).map((write) => write.bytes);
}

test("a camera move costs one bounded uniform write, whatever the population", async () => {
  const g = recordingGpu();
  const built = await build(g);
  try {
    const moves: number[][] = [];
    for (const size of [1, 64, 5000]) {
      built.layer.updateState(population(size));
      built.layer.setView(CAMERA);
      moves.push(committed(g, () => built.layer.setView({ ...CAMERA, eye: [size, 1, 2] })));
    }
    // Identical cost at one soldier and at five thousand: one write of the view block.
    expect(moves).toEqual([[VIEW_BYTES], [VIEW_BYTES], [VIEW_BYTES]]);
  } finally {
    built.dispose();
  }
});

test("a submission costs six floats per soldier and nothing more", async () => {
  const g = recordingGpu();
  const built = await build(g);
  try {
    expect(committed(g, () => built.layer.updateState(population(7)))).toEqual([7 * STATE_BYTES]);
    expect(committed(g, () => built.layer.updateState(population(400)))).toEqual([
      400 * STATE_BYTES,
    ]);
    // An empty audience commits nothing at all.
    expect(committed(g, () => built.layer.updateState([]))).toEqual([]);
    expect(built.layer.stats()).toMatchObject({ instances: 0, draws: 0 });
  } finally {
    built.dispose();
  }
});

test("growth replaces the soldier buffer alone and leaves the view block in place", async () => {
  const g = recordingGpu();
  const built = await build(g);
  try {
    built.layer.updateState(population(8));
    built.layer.setView(CAMERA);
    const before = g.buffers.length;
    const liveBefore = g.live.size;
    built.layer.updateState(population(600));
    // One new vertex buffer for the doubled capacity; the view block is not reallocated.
    expect(g.buffers.slice(before).map((buffer) => buffer.size)).toEqual([1024 * STATE_BYTES]);
    expect(g.live.size).toBe(liveBefore);
    // And a camera move still costs exactly the view block.
    expect(committed(g, () => built.layer.setView({ ...CAMERA, fovY: 1 }))).toEqual([VIEW_BYTES]);
    expect(built.layer.stats()).toMatchObject({ instances: 600, draws: 1 });
  } finally {
    built.dispose();
  }
  expect(g.live.size).toBe(0);
  expect(() => built.layer.setView(CAMERA)).toThrow("disposed");
  expect(() => built.layer.updateState([])).toThrow("disposed");
});

test("admission uploads the atlas once and leaves no error scope open", async () => {
  const g = recordingGpu();
  const built = await build(g);
  try {
    // Three channels of a 2x2 atlas, each a complete two-level chain, and nothing else.
    expect(g.textureWrites.map((write) => write.bytes)).toEqual([16, 4, 16, 4, 16, 4]);
    expect(g.errorScopes).toEqual([]);
    // Publishing soldiers and a camera never touches a texture again.
    built.layer.updateState(population(4));
    built.layer.setView(CAMERA);
    expect(g.textureWrites).toHaveLength(6);
  } finally {
    built.dispose();
  }
});

test("the compiled vertex stage consumes soldier state, never a packed record", async () => {
  const g = recordingGpu();
  const built = await build(g);
  try {
    const wgsl = g.shaders.join("\n");
    expect(wgsl).toContain("fn deriveImpostorRecord(");
    // Exactly the six camera-independent floats enter the stage; the packed twelve-float
    // record has no way in at all.
    const entry = wgsl.match(/@vertex fn vertex\((.*?)\) ->/)![1];
    expect(entry.match(/@location\(\d+\) (\w+): (\w+)/g)).toEqual([
      "@location(0) position: vec2f",
      "@location(1) facing: f32",
      "@location(2) faction: f32",
      "@location(3) elevation: f32",
      "@location(4) living: f32",
    ]);
    // The view block is the layer's own camera-dependent binding, and it is a uniform.
    expect(wgsl).toContain("var<uniform> view: ImpostorViewBlock");
    expect(d.sizeOf(ImpostorState)).toBe(STATE_BYTES);
    expect(d.sizeOf(ImpostorViewBlock)).toBe(VIEW_BYTES);
  } finally {
    built.dispose();
  }
});

test("the audience's camera refresh writes one view block per layer and no soldier bytes", async () => {
  const g = recordingGpu();
  const { root, environment } = stubEnvironment(g.native);
  const asset = { manifest: { bounds: { center: [0, 0, 0], radius: 1 } } };
  const view = (pixels: number): CrowdProjectionView => ({
    frustum: { planes: [] },
    shadow: false,
    projection: {
      view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -100, 1],
      pixelsPerViewUnit: pixels,
      perspective: false,
      near: 1,
    },
  });
  const owner = await createTypegpuCrowdAudience(
    g.native,
    { 0: asset, 1: asset } as never,
    { 0: atlasData(), 1: atlasData() } as never,
    {} as never,
    environment as never,
    1,
  );
  try {
    // Every soldier is far enough away to be a billboard, and all of them wear appearance 0.
    await owner.upload(population(300), [view(0.1)], CAMERA);
    expect(owner.stats().visibleTierHistogram[LOD_COUNT_KEYS[IMPOSTOR_LEVEL]]).toBe(300);
    const moved = committed(g, () => owner.refreshCamera({ ...CAMERA, eye: [40, -80, 12] }));
    // Two layers, two view blocks, nothing per soldier.
    expect(moved).toEqual([VIEW_BYTES, VIEW_BYTES]);
    // An unchanged camera is not republished at all.
    expect(committed(g, () => owner.refreshCamera({ ...CAMERA, eye: [40, -80, 12] }))).toEqual([]);
    // A resubmission is the only thing that costs soldier bytes: the populated layer pays
    // for its soldiers, the empty one pays for nothing, and both republish the view.
    const resubmitted = await (async () => {
      const before = g.writes.length;
      await owner.upload(population(300), [view(0.1)], CAMERA);
      return g.writes.slice(before).map((write) => write.bytes);
    })();
    expect(resubmitted).toEqual([300 * STATE_BYTES, VIEW_BYTES, VIEW_BYTES]);
  } finally {
    owner.dispose();
    root.destroy();
  }
});

// The derived record has no packed buffer to hand a caller, so the numerical control asks
// the installed layer what its own state and view produce. These pin that the answer comes
// from the buffers the draw binds and from no other moment in the layer's life.

test("no frame path builds or reads the record diagnostic", async () => {
  const g = recordingGpu();
  const built = await build(g, true);
  try {
    built.layer.updateState(population(9));
    built.layer.setView(CAMERA);
    const before = g.buffers.length;
    built.layer.updateState(population(9));
    built.layer.setView({ ...CAMERA, eye: [1, 2, 3] });
    // Submitting and moving the camera allocate nothing, dispatch nothing, read nothing.
    expect(g.buffers).toHaveLength(before);
    expect(g.dispatches).toEqual([]);
    expect(g.copies).toEqual([]);
    const records = await built.layer.readRecords();
    expect(records).toHaveLength(9);
    // Only now: the records buffer, one staging buffer, one dispatch, one copy.
    expect(g.buffers.slice(before).map((buffer) => buffer.size)).toEqual([
      512 * RECORD_BYTES,
      512 * RECORD_BYTES,
    ]);
    expect(g.dispatches.map((dispatch) => dispatch.groups)).toEqual([[1, 1, 1]]);
    expect(g.copies.map((copy) => copy.bytes)).toEqual([512 * RECORD_BYTES]);
  } finally {
    built.dispose();
  }
  // And the diagnostic's own buffer is released with the layer that owns it.
  expect(g.live.size).toBe(0);
});

test("a layer admitted without record diagnostics has no storage soldier buffer to read", async () => {
  const g = recordingGpu();
  const built = await build(g);
  try {
    built.layer.updateState(population(4));
    built.layer.setView(CAMERA);
    await expect(built.layer.readRecords()).rejects.toThrow("without record diagnostics");
    expect(g.dispatches).toEqual([]);
    // The soldier buffer a frame layer commits carries vertex usage and nothing else.
    const soldierBuffer = g.buffers.find((buffer) => buffer.size === 512 * STATE_BYTES)!;
    expect(soldierBuffer.usage & GPUBufferUsage.STORAGE).toBe(0);
    expect(soldierBuffer.usage & GPUBufferUsage.VERTEX).toBe(GPUBufferUsage.VERTEX);
  } finally {
    built.dispose();
  }
});

test("the diagnostic reads the soldier buffer growth installed, not the one it replaced", async () => {
  const g = recordingGpu();
  const built = await build(g, true);
  try {
    built.layer.updateState(population(8));
    built.layer.setView(CAMERA);
    await built.layer.readRecords();
    const first = bound(g.bindGroups.at(-1)!);
    built.layer.updateState(population(600));
    const records = await built.layer.readRecords();
    const second = bound(g.bindGroups.at(-1)!);
    // The view block is the same buffer throughout; the soldier buffer is not.
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1].size).toBe(1024 * STATE_BYTES);
    expect(records).toHaveLength(600);
    // Ten workgroups of sixty-four cover six hundred soldiers, and the stage bounds itself
    // on the buffer's own length, so the tail cannot read past it.
    expect(g.dispatches.at(-1)!.groups).toEqual([Math.ceil(600 / 64), 1, 1]);
  } finally {
    built.dispose();
  }
});

test("a republication or a disposal during the readback fails instead of answering", async () => {
  const g = recordingGpu();
  const built = await build(g, true);
  try {
    built.layer.updateState(population(5));
    built.layer.setView(CAMERA);
    // A camera published while the records are in flight: they are no longer anyone's.
    const duringCamera = built.layer.readRecords();
    built.layer.setView({ ...CAMERA, eye: [9, 9, 9] });
    await expect(duringCamera).rejects.toThrow("republished during readback");
    // And a submission, likewise.
    const duringSubmission = built.layer.readRecords();
    built.layer.updateState(population(6));
    await expect(duringSubmission).rejects.toThrow("republished during readback");
  } finally {
    built.dispose();
  }
  await expect(built.layer.readRecords()).rejects.toThrow("disposed");
});

test("a disposal during the readback fails instead of answering", async () => {
  const g = recordingGpu();
  const built = await build(g, true);
  built.layer.updateState(population(5));
  built.layer.setView(CAMERA);
  const inFlight = built.layer.readRecords();
  built.dispose();
  await expect(inFlight).rejects.toThrow("disposed");
});

test("the diagnostic stage compiles the same derivation the vertex stage does", async () => {
  const g = recordingGpu();
  const built = await build(g, true);
  try {
    built.layer.updateState(population(3));
    built.layer.setView(CAMERA);
    const beforeShaders = g.shaders.length;
    await built.layer.readRecords();
    const compute = g.shaders.slice(beforeShaders).join("\n");
    expect(compute).toContain(`@compute @workgroup_size(64)`);
    expect(compute).toContain("fn deriveImpostorRecord(");
    // It reads the soldier buffer as a runtime-sized array and bounds itself on its length,
    // so one stage serves every capacity the layer ever grows to.
    expect(compute).toContain("array<ImpostorState>");
    expect(compute).toContain("arrayLength(");
  } finally {
    built.dispose();
  }
});
