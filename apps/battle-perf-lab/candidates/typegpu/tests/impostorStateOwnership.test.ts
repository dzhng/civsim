/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
// @vitest-environment node
// What the REAL impostor layer makes a device commit, recorded through the production
// path: the bytes a submission costs, the bytes a camera move costs, what the vertex stage
// is actually compiled to consume, and what survives growth and disposal. The crowd mesh
// is the only mocked leaf; every impostor resource here is the one the lab builds.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { tgpu, d } from "typegpu";
import { recordingGpu } from "./recordingDevice";
import { createTypegpuImpostors } from "../impostor";
import { createTypegpuCrowdAudience } from "../crowdAudience";
import { ImpostorState, ImpostorViewBlock } from "../impostorDerivation";
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
vi.mock("../crowd", () => ({ createTypegpuCrowd: async () => mesh }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

const STATE_BYTES = 24;
const VIEW_BYTES = 48;
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
const build = async (g: ReturnType<typeof recordingGpu>) => {
  const { root, environment } = stubEnvironment(g.native);
  const layer = await createTypegpuImpostors(
    g.native,
    atlasData() as never,
    environment as never,
    1,
  );
  return { layer, dispose: () => (layer.dispose(), root.destroy()) };
};

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
