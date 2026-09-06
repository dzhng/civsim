import { afterEach, expect, test, vi } from "vitest";
import * as THREE from "three/webgpu";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";

const gpu = vi.hoisted(() => ({
  backend: { trackTimestamp: true },
  pending: { render: 0, compute: 0 },
  resolves: 0,
  fail: null as "render" | "compute" | null,
}));

vi.mock("three/webgpu", async (original) => {
  const actual = await original<typeof import("three/webgpu")>();
  return {
    ...actual,
    WebGPURenderer: class {
      backend = gpu.backend;
      shadowMap = {};
      info = { render: { drawCalls: 1, triangles: 2, timestamp: 0 }, compute: { timestamp: 0 } };
      setOpaqueSort() {}
      setTransparentSort() {}
      async init() {}
      render() {
        if (this.backend.trackTimestamp) gpu.pending.render += 2;
      }
      async resolveTimestampsAsync(type: "render" | "compute") {
        gpu.resolves++;
        if (gpu.fail === type) throw new Error("propagated timestamp resolution failure");
        gpu.pending[type] = 0;
        this.info[type].timestamp = type === "render" ? 3 : 40;
      }
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  gpu.backend.trackTimestamp = true;
  gpu.pending.render = gpu.pending.compute = gpu.resolves = 0;
  gpu.fail = null;
});

test("an older successful readback cannot restore timing after a propagated resolution failure", async () => {
  const world = await PhotorealWorld.create(document.createElement("canvas"));
  const camera = new THREE.PerspectiveCamera();
  world.render(camera);
  await vi.waitFor(() => expect(world.stats().gpuTimeMs).toBe(3));
  let release!: () => void;
  const earlier = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(world.renderer, "resolveTimestampsAsync")
    .mockImplementationOnce(async () => {
      await earlier;
    })
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("later propagated timestamp resolution failure"))
    .mockResolvedValueOnce(undefined);
  world.render(camera);
  world.render(camera);
  await vi.waitFor(() => expect(gpu.backend.trackTimestamp).toBe(false));
  expect(world.stats().gpuTimeMs).toBeNull();
  world.renderer.info.render.timestamp = 99;
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(world.stats().gpuTimeMs).toBeNull();
  expect(gpu.backend.trackTimestamp).toBe(false);
});

test("the production frame boundary drains both query pools while publishing render time only", async () => {
  const world = await PhotorealWorld.create(document.createElement("canvas"));
  gpu.pending.compute = 2; // A palette dispatch precedes the visible frame.
  world.render(new THREE.PerspectiveCamera());
  await vi.waitFor(() => expect(world.stats().gpuTimeMs).toBe(3));
  expect(gpu.pending).toEqual({ render: 0, compute: 0 });
  expect(world.stats()).toMatchObject({ drawCalls: 1, triangles: 2, gpuTimeMs: 3 });
});

test.each(["render", "compute"] as const)(
  "propagated %s timestamp failure stops query allocation and invalidates stale timing",
  async (type) => {
    const world = await PhotorealWorld.create(document.createElement("canvas"));
    const camera = new THREE.PerspectiveCamera();
    world.render(camera);
    await vi.waitFor(() => expect(world.stats().gpuTimeMs).toBe(3));
    gpu.fail = type;
    gpu.pending.compute = 2;
    world.render(camera);
    await vi.waitFor(() => expect(gpu.backend.trackTimestamp).toBe(false));
    expect(world.stats().gpuTimeMs).toBeNull();
    const pending = { ...gpu.pending },
      resolves = gpu.resolves;
    world.render(camera);
    await Promise.resolve();
    expect(gpu.pending).toEqual(pending);
    expect(gpu.resolves).toBe(resolves);
  },
);
