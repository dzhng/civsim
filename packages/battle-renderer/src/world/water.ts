import { prepareWaterSurfaces, type BattleWaterInput } from "../waterData";
import { waterShader } from "../shaders/water";
import type { RawEnvironment } from "./environment";

/** Opaque, front-sided, depth-writing water, matching the source standard
 * material. The caller encodes this before read-only world decals. All GPU
 * allocations here are owned; device, camera, environment and targets borrowed. */
export class RawBattleWater {
  private readonly owned: GPUBuffer[] = [];
  private readonly draws: {
    positions: GPUBuffer;
    shore: GPUBuffer;
    indices: GPUBuffer;
    count: number;
    group: GPUBindGroup;
    pipeline: GPURenderPipeline;
  }[] = [];
  private readonly empty: GPUBindGroup;
  private disposed = false;
  constructor(
    device: GPUDevice,
    cameraLayout: GPUBindGroupLayout,
    private readonly environment: RawEnvironment,
    inputs: readonly BattleWaterInput[],
    samples: 1 | 4 = 1,
  ) {
    try {
      const layout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      });
      const emptyLayout = device.createBindGroupLayout({ entries: [] });
      this.empty = device.createBindGroup({ layout: emptyLayout, entries: [] });
      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [cameraLayout, layout, emptyLayout, environment.layout],
      });
      const pipelines = new Map<string, GPURenderPipeline>();
      const buffer = (data: Float32Array | Uint32Array, usage: number) => {
        const resource = device.createBuffer({
          size: Math.max(4, data.byteLength),
          usage,
          mappedAtCreation: true,
        });
        this.owned.push(resource);
        new Uint8Array(resource.getMappedRange()).set(
          new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        );
        resource.unmap();
        return resource;
      };
      for (const geometry of prepareWaterSurfaces(inputs)) {
        const lake = geometry.kind === "lake";
        let pipeline = pipelines.get(geometry.kind);
        if (!pipeline) {
          const module = device.createShaderModule({
            label: `native ${geometry.kind} water`,
            code: waterShader(environment.shader, lake),
          });
          pipeline = device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
              module,
              entryPoint: "vertex",
              buffers: [
                {
                  arrayStride: 12,
                  attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
                },
                {
                  arrayStride: 4,
                  attributes: [{ shaderLocation: 1, offset: 0, format: "float32" }],
                },
              ],
            },
            fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
            primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
            depthStencil: {
              format: "depth32float",
              depthWriteEnabled: true,
              depthCompare: "greater-equal",
            },
            multisample: { count: samples },
          });
          pipelines.set(geometry.kind, pipeline);
        }
        const state = buffer(geometry.state, GPUBufferUsage.UNIFORM);
        const shore = geometry.shoreDist;
        this.draws.push({
          positions: buffer(geometry.positions, GPUBufferUsage.VERTEX),
          shore: buffer(shore, GPUBufferUsage.VERTEX),
          indices: buffer(geometry.indices, GPUBufferUsage.INDEX),
          count: geometry.indices.length,
          pipeline,
          group: device.createBindGroup({
            layout,
            entries: [{ binding: 0, resource: { buffer: state } }],
          }),
        });
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  encode(pass: GPURenderPassEncoder, camera: GPUBindGroup) {
    if (this.disposed) throw new Error("Water disposed");
    pass.setBindGroup(0, camera);
    pass.setBindGroup(2, this.empty);
    pass.setBindGroup(3, this.environment.bindGroup);
    for (const draw of this.draws) {
      pass.setPipeline(draw.pipeline);
      pass.setBindGroup(1, draw.group);
      pass.setVertexBuffer(0, draw.positions);
      pass.setVertexBuffer(1, draw.shore);
      pass.setIndexBuffer(draw.indices, "uint32");
      pass.drawIndexed(draw.count);
    }
  }
  stats() {
    return {
      draws: this.draws.length,
      triangles: this.draws.reduce((sum, draw) => sum + draw.count / 3, 0),
      ownedBuffers: this.disposed ? 0 : this.owned.length,
      depth: "read-write",
      blending: "opaque",
      disposed: this.disposed,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.owned) resource.destroy();
  }
}
