// @vitest-environment node
import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { SkinnedCrowdPipeline } from "@packages/renderer-core/src/skinnedPipeline";
import type { SoldierMeshData } from "@packages/soldier-assets/src/mesh";
import type { VatBake } from "@packages/soldier-assets/src/schema";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";

test("class clip lookup follows appearances, not their flattened LOD resources", () => {
  vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, VERTEX: 2, INDEX: 4, UNIFORM: 8, STORAGE: 16 });
  vi.stubGlobal("GPUTextureUsage", { TEXTURE_BINDING: 1, COPY_DST: 2 });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2 });
  try {
    // Only the hardware boundary is inert; construction, mesh packing, VAT
    // allocation/layout and the public appearance lookup all run unchanged.
    const writes = new Map<string, Float32Array>();
    const device = {
      createBindGroupLayout: () => ({}),
      createBindGroup: () => ({}),
      createBuffer: (descriptor: { label: string }) => ({ label: descriptor.label, destroy() {} }),
      createTexture: () => ({ createView: () => ({}) }),
      createSampler: () => ({}),
      createShaderModule: () => ({}),
      createPipelineLayout: () => ({}),
      createRenderPipeline: () => ({}),
      queue: {
        writeBuffer(buffer: { label: string }, offset: number, data: Float32Array) {
          writes.set(buffer.label, data.slice());
        },
        writeTexture() {},
      },
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
      clips: [{ name: "idle", start, frames: 2, loop: true, duration: 1 }, { name: 'attack', start: 2, frames: 3, loop: false, duration: 2 }],
      layout: "test",
      sha256: "test",
      data: Array.from({ length: 128 }, (_, i) => Number(Math.floor(i / 32) === i % 4)),
    });
    const appearance = (start: number): AppearanceBundle => ({
      manifest: {
        name: `fixture-${start}`, mounted: false, skeleton: 'rig.json', animation: 'animation.json',
        materials: 'materials.json', tiers: ['near.json', 'mid.json', 'far.json'],
        far: { mesh: 'far.json', clip: 'idle', phase: 0 }, bounds: { center: [0, 0, 0], radius: 1 },
      },
      rig: { bones: [{ name: 'root', parent: -1, bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: new Float32Array(16) }], clips: [] },
      animation: bake(start), materials: [{ name: 'neutral', baseColor: [1, 1, 1, 1], roughness: 1, metallic: 0 }],
      tiers: [mesh, mesh, { ...mesh, indices: new Uint32Array([0, 1, 2, 2, 1, 0]) }], farMesh: mesh,
    });
    const crowd = new SkinnedCrowdPipeline(shell, { 0: appearance(0), 5: appearance(5) });
    assert.deepEqual(crowd.classClip(0, "idle"), { name: "idle", start: 0, frames: 2, loop: true, duration: 1 });
    assert.deepEqual(crowd.classClip(5, "idle"), { name: "idle", start: 5, frames: 2, loop: true, duration: 1 });
    assert.throws(() => crowd.classClip(1, 'idle'), /appearance 1 is not loaded/);
    assert.throws(() => crowd.classClip(0.5, 'idle'), /appearance 0.5 is not loaded/);
    const [instance] = generatedFormation(1, { frame: 0 });
    crowd.upload([{ ...instance, x: 19, classId: 5, lod: 2, clip: 'idle' }]);
    const draws: number[][] = [];
    const indexFormats: GPUIndexFormat[] = [];
    let instanceValues: Float32Array | undefined;
    const pass = {
      setPipeline() {}, setBindGroup() {},
      setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat) { indexFormats.push(format); },
      setVertexBuffer(slot: number, buffer: { label: string }) { if (slot === 1) instanceValues = writes.get(buffer.label); },
      drawIndexed(indices: number, instances: number) { draws.push([indices, instances, instanceValues![0], instanceValues![5]]); },
    } as unknown as Parameters<SkinnedCrowdPipeline['draw']>[0];
    crowd.draw(pass);
    assert.deepEqual(draws, [[6, 1, 19, 5]], 'sparse class 5 / L2 uses its own geometry, clip and submitted world position');
    assert.deepEqual(indexFormats, ['uint32']);
    crowd.upload([{ ...instance, classId: 5, lod: 2, clip: 'attack', phase: 1 }]);
    crowd.draw(pass);
    assert.equal(instanceValues![7], 1, 'the final nonloop pose must reach the shader unchanged');
    assert.throws(() => crowd.upload([{ ...instance, classId: 1 }]), /appearance 1 is not loaded/);
  } finally {
    vi.unstubAllGlobals();
  }
});
