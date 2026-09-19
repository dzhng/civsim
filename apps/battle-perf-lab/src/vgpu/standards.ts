import { draw, geometry, type Gpu, type FramePass } from "vgpu";
import { buildStandardMesh } from "../../../../packages/game-renderer/src/models/shared/standardAsset";
import {
  BATTLE_STANDARD_TIER,
  BattleStandardRecords,
  battleStandardCapacity,
  type BattleStandardInstance,
} from "../../../../packages/game-renderer/src/models/shared/battleStandardData";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
import { standardsShader } from "../../../../packages/battle-renderer/src/shaders/standards";
import type { VgpuEnvironment } from "./environment";
export async function createVgpuStandards(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  samples: 1 | 4 = 1,
) {
  const source = buildStandardMesh(BATTLE_STANDARD_TIER).opaque,
    records = new BattleStandardRecords(),
    owned = new Set<{ destroy(): void }>();
  const own = <T extends { destroy(): void }>(b: T) => {
    owned.add(b);
    return b;
  };
  let uploading = false;
  let disposed = false,
    capacity = 32,
    count = 0,
    selected = 0,
    visible = true;
  const check = () => {
      if (disposed) throw Error("vgpu standards disposed");
    },
    dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const b of owned) b.destroy();
    };
  const finish = beginGpuAdmission(gpu.device.gpu);
  try {
    const vertices = own(
      gpu.device.createBuffer({ size: source.vertices.byteLength, usage: ["vertex", "copy_dst"] }),
    );
    vertices.write(source.vertices.slice());
    let instances = own(
      gpu.device.createBuffer({ size: capacity * 44, usage: ["vertex", "copy_dst"] }),
    );
    const state = own(gpu.device.createBuffer({ size: 80, usage: ["uniform", "copy_dst"] }));
    const mesh = own(
      geometry(gpu, {
        vertexCount: source.vertices.length / 10,
        buffers: [
          {
            buffer: vertices.gpu,
            stride: 40,
            attributes: {
              local: { format: "float32x3", offset: 0 },
              normal: { format: "float32x3", offset: 12 },
              uvwm: { format: "float32x4", offset: 24 },
            },
          },
        ],
        indices: source.indices.slice(),
      }),
    );
    // Public GeometryLike keeps the instance-buffer reference live across capacity growth.
    const input = {
      indexCount: mesh.indexCount,
      indexBuffer: mesh.indexBuffer,
      indexFormat: mesh.indexFormat,
      vertexBufferLayouts: [
        ...mesh.vertexBufferLayouts,
        {
          arrayStride: 44,
          stepMode: "instance" as const,
          attributes: [
            { shaderLocation: 3, format: "float32x4" as const, offset: 0 },
            { shaderLocation: 4, format: "float32x4" as const, offset: 16 },
            { shaderLocation: 5, format: "float32x3" as const, offset: 32 },
          ],
        },
      ],
      get vertexBuffers() {
        return [...mesh.vertexBuffers, instances.gpu];
      },
    };
    const render = draw(gpu, {
      shader: standardsShader(environment.shader),
      geometry: input,
      set: { cam: camera, standard: state, ...environment.bindings },
      cull: "none",
      depth: { write: true, compare: "greater-equal" },
    });
    await render.compile({ colors: ["rgba16float"], depth: "depth32float", sampleCount: samples });
    await finish();
    return {
      async upload(input: readonly BattleStandardInstance[]) {
        check();
        if (uploading) throw Error("Standards upload already in flight");
        uploading = true;
        try {
          const nextCapacity = battleStandardCapacity(input.length, capacity);
          if (nextCapacity * 44 > gpu.device.gpu.limits.maxBufferSize)
            throw Error("Standards buffer limit");
          const data = records.write(input);
          if (nextCapacity > capacity) {
            const admit = beginGpuAdmission(gpu.device.gpu);
            let next: typeof instances | undefined;
            try {
              next = own(
                gpu.device.createBuffer({
                  size: nextCapacity * 44,
                  usage: ["vertex", "copy_dst"],
                }),
              );
              if (data.length) next.write(data);
              await admit();
              check();
            } catch (error) {
              try {
                await admit();
              } finally {
                next?.destroy();
                if (next) owned.delete(next);
              }
              throw error;
            }
            instances.destroy();
            owned.delete(instances);
            instances = next;
            capacity = nextCapacity;
          } else if (data.length) instances.write(data);
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
        state.write(data);
      },
      setVisible(value: boolean) {
        visible = value;
      },
      draw(pass: FramePass) {
        check();
        if (visible && count) pass.draw(render, { instances: count });
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
