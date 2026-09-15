import type { PhotorealBattleGroundMesh } from "../../../../packages/game-renderer/src/battle/groundPass";
import { frontSideGroundIndices } from "../../../../packages/game-renderer/src/battle/groundPass";
import type { BattleHorizonLayout } from "../../../../packages/game-renderer/src/battle/horizonPass";
import type { TerrainMaterialOptions } from "../shaders/terrainMaterial";
import { terrainShaders } from "../shaders/terrain";
import type { RawEnvironment } from "./environment";

interface Draw {
  pipeline: GPURenderPipeline;
  buffers: GPUBuffer[];
  indices: GPUBuffer;
  indexFormat: GPUIndexFormat;
  count: number;
}
/** Base playable ground plus opaque horizon blockers. Vista/ocean/lake/grass/
 * scenery are separate scene components. Borrowed camera/environment/targets;
 * this owner allocates only geometry, earth SDF and terrain-state resources. */
export class RawBattleTerrain {
  private readonly owned: { destroy(): void }[] = [];
  private readonly draws: Draw[] = [];
  private readonly group: GPUBindGroup;
  private readonly state: GPUBuffer;
  private readonly emptyGroup: GPUBindGroup;
  private disposed = false;
  constructor(
    private readonly device: GPUDevice,
    cameraLayout: GPUBindGroupLayout,
    private readonly environment: RawEnvironment,
    ground: Omit<PhotorealBattleGroundMesh, "earthDistance">,
    horizon: BattleHorizonLayout | null,
    options: TerrainMaterialOptions = {},
    mode: "beauty" | "material" = "beauty",
    sampleCount: 1 | 4 = 1,
    invariantPosition = true,
  ) {
    try {
      const buffer = (data: Float32Array | Uint32Array | Uint16Array, usage: number) => {
        const b = device.createBuffer({
          size: Math.max(4, Math.ceil(data.byteLength / 4) * 4),
          usage: usage | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true,
        });
        this.owned.push(b);
        new Uint8Array(b.getMappedRange()).set(
          new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        );
        b.unmap();
        return b;
      };
      this.state = buffer(new Float32Array([1, 1, 0, 0]), GPUBufferUsage.UNIFORM);
      const sdf = options.earthDistance;
      const distance = device.createTexture({
        size: [sdf?.width ?? 1, sdf?.height ?? 1],
        format: "rg8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.owned.push(distance);
      device.queue.writeTexture(
        { texture: distance },
        sdf?.data ?? new Uint8Array([0, 0]),
        { bytesPerRow: (sdf?.width ?? 1) * 2 },
        [sdf?.width ?? 1, sdf?.height ?? 1],
      );
      const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
      const layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ],
      });
      this.group = device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.state } },
          { binding: 1, resource: distance.createView() },
          { binding: 2, resource: sampler },
        ],
      });
      const emptyLayout = device.createBindGroupLayout({ entries: [] });
      this.emptyGroup = device.createBindGroup({ layout: emptyLayout, entries: [] });
      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [cameraLayout, layout, emptyLayout, environment.layout],
      });
      const shaders = terrainShaders(
        environment.shader,
        options,
        mode,
        invariantPosition,
        environment.shadows && !options.vistaBand,
      );
      const pipeline = (code: string, buffers: GPUVertexBufferLayout[]) => {
        const module = device.createShaderModule({ code });
        return device.createRenderPipeline({
          layout: pipelineLayout,
          multisample: { count: sampleCount },
          vertex: { module, entryPoint: "vertex", buffers },
          fragment: {
            module,
            entryPoint: "fragment",
            targets: [
              {
                format: "rgba16float",
                ...(options.vistaBand === "farFog"
                  ? {
                      blend: {
                        color: {
                          srcFactor: "src-alpha" as const,
                          dstFactor: "one-minus-src-alpha" as const,
                          operation: "add" as const,
                        },
                        alpha: {
                          srcFactor: "one" as const,
                          dstFactor: "one-minus-src-alpha" as const,
                          operation: "add" as const,
                        },
                      },
                    }
                  : {}),
              },
            ],
          },
          primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
          depthStencil: {
            format: "depth32float",
            depthWriteEnabled: options.vistaBand !== "farFog",
            depthCompare: "greater-equal",
          },
        });
      };
      const groundPipeline = pipeline(shaders.ground, [
        {
          arrayStride: 40,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x3" },
            { shaderLocation: 2, offset: 36, format: "float32" },
          ],
        },
        { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: "float32" }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 4, offset: 0, format: "float32x3" }] },
      ]);
      this.draws.push({
        pipeline: groundPipeline,
        buffers: [
          buffer(ground.vertices, GPUBufferUsage.VERTEX),
          buffer(ground.tint, GPUBufferUsage.VERTEX),
          buffer(ground.surfaceColor, GPUBufferUsage.VERTEX),
        ],
        indices: buffer(frontSideGroundIndices(ground.indices), GPUBufferUsage.INDEX),
        indexFormat: "uint32",
        count: ground.indices.length,
      });
      if (horizon && horizon.mesh.indices.length) {
        const h = horizon.mesh;
        const p = pipeline(shaders.horizon, [
          {
            arrayStride: 40,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
              { shaderLocation: 2, offset: 24, format: "float32x3" },
            ],
          },
        ]);
        this.draws.push({
          pipeline: p,
          buffers: [buffer(h.vertices, GPUBufferUsage.VERTEX)],
          indices: buffer(h.indices, GPUBufferUsage.INDEX),
          indexFormat: "uint16",
          count: h.indices.length,
        });
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  setState(farStrength: number, shadow = 1) {
    if (this.disposed) throw new Error("Terrain disposed");
    this.device.queue.writeBuffer(this.state, 0, new Float32Array([farStrength, shadow, 0, 0]));
  }
  encode(pass: GPURenderPassEncoder, cameraGroup: GPUBindGroup) {
    if (this.disposed) throw new Error("Terrain disposed");
    pass.setBindGroup(0, cameraGroup);
    pass.setBindGroup(1, this.group);
    pass.setBindGroup(2, this.emptyGroup);
    pass.setBindGroup(3, this.environment.bindGroup);
    for (const draw of this.draws) {
      pass.setPipeline(draw.pipeline);
      draw.buffers.forEach((buffer, i) => pass.setVertexBuffer(i, buffer));
      pass.setIndexBuffer(draw.indices, draw.indexFormat);
      pass.drawIndexed(draw.count);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.owned) resource.destroy();
  }
}
