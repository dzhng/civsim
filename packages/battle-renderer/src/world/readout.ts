import { readoutCamera } from "../readoutCamera";
import {
  QUAD,
  QUAD_INDEX,
  layoutReadout,
  buildChipAtlas,
  packReadoutChips,
  type BattleReadoutInstance,
  type ChipInstance,
  type AtlasEntry,
} from "../../../game-renderer/src/battle/readoutData";
import {
  GrowableBuffer,
  makeVertexBuffer,
  makeIndexBuffer,
} from "../../../renderer-core/src/gpuBuffers";
import { readoutWgsl } from "../shaders/readout";
import { battleDepthBypass } from "../worldDepth";
/** Source-equivalent cutout UI billboards: no depth test/write, lighting, fog or local tone map. */
export function createRawReadout(device: GPUDevice, samples: 1 | 4, withDepth = true) {
  const owned: ({ destroy(): void } | { dispose(): void })[] = [];
  let disposed = false;
  const own = <T extends { destroy(): void } | { dispose(): void }>(r: T) => {
    owned.push(r);
    return r;
  };
  let atlas: GPUTexture | undefined;
  let atlasUploads = 0,
    atlasUploadBytes = 0,
    instanceUploadBytes = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    atlas?.destroy();
    for (const r of owned.reverse()) {
      if ("destroy" in r) r.destroy();
      else r.dispose();
    }
  };
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    if (!canvas.getContext("2d")) throw Error("2D canvas unavailable for readout atlas");
    let atlasKey = "",
      entries = new Map<string, AtlasEntry>(),
      count = 0,
      readouts = 0;
    const camera = own(
      device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    );
    const vertices = own(makeVertexBuffer(device, "readout quad", QUAD)),
      indices = own(makeIndexBuffer(device, "readout indices", new Uint16Array(QUAD_INDEX)));
    const chip0 = own(
        new GrowableBuffer(device, "readout anchors", GPUBufferUsage.VERTEX, 128 * 16),
      ),
      chip1 = own(
        new GrowableBuffer(device, "readout dimensions", GPUBufferUsage.VERTEX, 128 * 16),
      ),
      chipUv = own(
        new GrowableBuffer(device, "readout atlas cells", GPUBufferUsage.VERTEX, 128 * 16),
      );
    const cameraLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
    });
    const atlasLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const cameraGroup = device.createBindGroup({
      layout: cameraLayout,
      entries: [{ binding: 0, resource: { buffer: camera } }],
    });
    const linear = device.createSampler({ minFilter: "linear", magFilter: "linear" });
    let atlasGroup: GPUBindGroup;
    const replaceAtlas = () => {
      const next = device.createTexture({
        size: [canvas.width, canvas.height],
        format: "rgba8unorm-srgb",
        usage:
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      try {
        device.queue.copyExternalImageToTexture(
          { source: canvas, flipY: false },
          { texture: next, premultipliedAlpha: false, colorSpace: "srgb" },
          [canvas.width, canvas.height],
        );
        const group = device.createBindGroup({
          layout: atlasLayout,
          entries: [
            { binding: 0, resource: next.createView() },
            { binding: 1, resource: linear },
          ],
        });
        atlas?.destroy();
        atlas = next;
        atlasUploads++;
        atlasUploadBytes += canvas.width * canvas.height * 4;
        atlasGroup = group;
      } catch (error) {
        next.destroy();
        throw error;
      }
    };
    replaceAtlas();
    const module = device.createShaderModule({ code: readoutWgsl });
    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, atlasLayout] }),
      vertex: {
        module,
        entryPoint: "vertex",
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          ...[1, 2, 3].map((shaderLocation) => ({
            arrayStride: 16,
            stepMode: "instance" as const,
            attributes: [{ shaderLocation, offset: 0, format: "float32x4" as const }],
          })),
        ],
      },
      fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
      primitive: { cullMode: "none" },
      multisample: { count: samples },
      ...(withDepth ? { depthStencil: battleDepthBypass() } : {}),
    });
    const live = () => {
      if (disposed) throw Error("Readout disposed");
    };
    return {
      upload(instances: readonly BattleReadoutInstance[]) {
        live();
        const chips: ChipInstance[] = [];
        for (const r of instances) layoutReadout(r, chips);
        const keys = [...new Set(chips.map((c) => c.key))].sort(),
          key = keys.join("|");
        if (key !== atlasKey) {
          entries = buildChipAtlas(keys, canvas);
          replaceAtlas();
          atlasKey = key;
        }
        const packed = packReadoutChips(chips, entries);
        chip0.write(packed.chip0);
        chip1.write(packed.chip1);
        chipUv.write(packed.chipUv);
        instanceUploadBytes += chips.length * 48;
        count = chips.length;
        readouts = instances.length;
      },
      setCamera(vp: ArrayLike<number>, matrixWorld: ArrayLike<number>) {
        live();
        const values = readoutCamera(vp, matrixWorld);
        device.queue.writeBuffer(camera, 0, values);
      },
      draw(pass: GPURenderPassEncoder) {
        live();
        if (!count) return;
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, cameraGroup);
        pass.setBindGroup(1, atlasGroup);
        pass.setVertexBuffer(0, vertices);
        pass.setVertexBuffer(1, chip0.buffer);
        pass.setVertexBuffer(2, chip1.buffer);
        pass.setVertexBuffer(3, chipUv.buffer);
        pass.setIndexBuffer(indices, "uint16");
        pass.drawIndexed(QUAD_INDEX.length, count);
      },
      stats: () => ({
        readouts,
        chips: count,
        atlasUploads,
        atlasUploadBytes,
        instanceUploadBytes,
        atlasWidth: canvas.width,
        atlasHeight: canvas.height,
      }),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
