import { buildStandardMesh } from "../../../../packages/game-renderer/src/models/shared/standardAsset";
import {
  BATTLE_STANDARD_TIER,
  BattleStandardRecords,
  battleStandardCapacity,
  type BattleStandardInstance,
} from "../../../../packages/game-renderer/src/models/shared/battleStandardData";
import { beginGpuAdmission } from "../gpuAdmission";
import { standardsShader } from "../shaders/standards";
import type { RawEnvironment } from "./environment";
export async function createRawStandards(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  samples: 1 | 4 = 1,
) {
  const mesh = buildStandardMesh(BATTLE_STANDARD_TIER).opaque,
    records = new BattleStandardRecords(),
    owned = new Set<GPUBuffer>();
  let uploading = false;
  let disposed = false,
    capacity = 32,
    count = 0,
    selected = 0,
    visible = true;
  const buffer = (size: number, usage: number, data?: ArrayBufferView) => {
    const b = device.createBuffer({ size, usage });
    owned.add(b);
    if (data) device.queue.writeBuffer(b, 0, data);
    return b;
  };
  const check = () => {
    if (disposed) throw Error("Raw standards disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const b of owned) b.destroy();
  };
  const finish = beginGpuAdmission(device);
  try {
    const vertices = buffer(
        mesh.vertices.byteLength,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mesh.vertices,
      ),
      indices = buffer(
        mesh.indices.byteLength,
        GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mesh.indices,
      );
    let instances = buffer(capacity * 44, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    const state = buffer(80, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
      stateLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      }),
      group = device.createBindGroup({
        layout: stateLayout,
        entries: [{ binding: 0, resource: { buffer: state } }],
      });
    const empty = device.createBindGroupLayout({ entries: [] }),
      emptyGroup = device.createBindGroup({ layout: empty, entries: [] }),
      module = device.createShaderModule({ code: standardsShader(environment.shader) });
    const pipeline = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [cameraLayout, stateLayout, empty, environment.layout],
      }),
      vertex: {
        module,
        entryPoint: "vertex",
        buffers: [
          {
            arrayStride: 40,
            attributes: [
              { shaderLocation: 0, format: "float32x3", offset: 0 },
              { shaderLocation: 1, format: "float32x3", offset: 12 },
              { shaderLocation: 2, format: "float32x4", offset: 24 },
            ],
          },
          {
            arrayStride: 44,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 3, format: "float32x4", offset: 0 },
              { shaderLocation: 4, format: "float32x4", offset: 16 },
              { shaderLocation: 5, format: "float32x3", offset: 32 },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "greater-equal",
      },
      multisample: { count: samples },
    });
    await finish();
    return {
      async upload(input: readonly BattleStandardInstance[]) {
        check();
        if (uploading) throw Error("Standards upload already in flight");
        uploading = true;
        try {
          const nextCapacity = battleStandardCapacity(input.length, capacity);
          if (nextCapacity * 44 > device.limits.maxBufferSize)
            throw Error("Standards buffer limit");
          const bytes = records.write(input);
          if (nextCapacity > capacity) {
            const admit = beginGpuAdmission(device);
            let next: GPUBuffer | undefined;
            try {
              next = buffer(
                nextCapacity * 44,
                GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                bytes,
              );
              await admit();
              check();
            } catch (error) {
              try {
                await admit();
              } finally {
                if (next) {
                  next.destroy();
                  owned.delete(next);
                }
              }
              throw error;
            }
            instances.destroy();
            owned.delete(instances);
            instances = next;
            capacity = nextCapacity;
          } else if (bytes.length) device.queue.writeBuffer(instances, 0, bytes);
          count = records.count;
          selected = records.selected;
        } finally {
          uploading = false;
        }
      },
      setView(view: ArrayLike<number>, time: number) {
        check();
        if (view.length !== 16) throw Error("Standards require a view matrix");
        const data = new Float32Array(20);
        data.set(view);
        data[16] = time;
        device.queue.writeBuffer(state, 0, data);
      },
      setVisible(value: boolean) {
        visible = value;
      },
      draw(pass: GPURenderPassEncoder, camera: GPUBindGroup) {
        check();
        if (!visible || !count) return;
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, camera);
        pass.setBindGroup(1, group);
        pass.setBindGroup(2, emptyGroup);
        pass.setBindGroup(3, environment.bindGroup);
        pass.setVertexBuffer(0, vertices);
        pass.setVertexBuffer(1, instances);
        pass.setIndexBuffer(indices, "uint16");
        pass.drawIndexed(mesh.indexCount, count);
      },
      stats: () => ({ count, selected, capacity, pipelines: 1 }),
      dispose,
    };
  } catch (error) {
    try {
      await finish();
    } finally {
      dispose();
    }
    throw error;
  }
}
