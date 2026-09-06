// @vitest-environment node
import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import type { SoldierMeshData } from "@packages/soldier-assets/src/mesh";
import type { VatBake } from "@packages/soldier-assets/src/schema";

test("class clip lookup follows appearances, not their flattened LOD resources", () => {
  vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, VERTEX: 2, INDEX: 4, UNIFORM: 8, STORAGE: 16 });
  vi.stubGlobal("GPUTextureUsage", { TEXTURE_BINDING: 1, COPY_DST: 2 });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2 });
  try {
    // Only the hardware boundary is inert; construction, mesh packing, VAT
    // allocation/layout and the public appearance lookup all run unchanged.
    const device = {
      createBindGroupLayout: () => ({}),
      createBindGroup: () => ({}),
      createBuffer: () => ({}),
      createTexture: () => ({ createView: () => ({}) }),
      createSampler: () => ({}),
      createShaderModule: () => ({}),
      createPipelineLayout: () => ({}),
      createRenderPipeline: () => ({}),
      queue: { writeBuffer() {}, writeTexture() {} },
    };
    const shell = {
      device,
      info: { format: "rgba8unorm", caps: { maxStorageBufferBindingSize: 65536 } },
      sampleCount: 1,
      cameraBindGroupLayout: {},
    } as unknown as ConstructorParameters<typeof SkinnedCrowdPipeline>[0];
    const mesh: SoldierMeshData = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      colors: new Float32Array(12).fill(1),
      joints: new Uint16Array(12),
      weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      uvs: new Float32Array(6),
      tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
      materialIds: new Float32Array(3),
      factionMasks: new Float32Array(3),
      indices: new Uint16Array([0, 1, 2]),
    };
    const bake = (start: number): VatBake => ({
      schema: 1,
      skeleton: "test",
      fps: 1,
      width: 8,
      height: 4,
      bones: 1,
      clips: [{ name: "idle", start, frames: 2 }],
      layout: "test",
      sha256: "test",
      data: Array.from({ length: 128 }, (_, i) => Number(Math.floor(i / 32) === i % 4)),
    });
    const crowd = new SkinnedCrowdPipeline(
      shell,
      [
        [mesh, mesh, mesh],
        [mesh, mesh, mesh],
      ],
      [bake(0), bake(5)],
    );
    assert.deepEqual(crowd.classClip(0, "idle"), { name: "idle", start: 0, frames: 2, loop: true });
    assert.deepEqual(crowd.classClip(1, "idle"), { name: "idle", start: 5, frames: 2, loop: true });
  } finally {
    vi.unstubAllGlobals();
  }
});
