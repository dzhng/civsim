import {
  BACKDROP_INDICES,
  backdropVertices,
} from "../../../../../packages/battle-renderer/src/backdropData";
import {
  makeIndexBuffer,
  makeVertexBuffer,
} from "../../../../../packages/renderer-core/src/gpuBuffers";
import {
  backdropShader,
  type BackdropKind,
} from "../../../../../packages/battle-renderer/src/shaders/backdrop";
import { beginGpuAdmission } from "../../../../../packages/battle-renderer/src/gpuAdmission";
import type { RawEnvironment } from "./environment";
import { battleDepthBypass } from "../../../../../packages/battle-renderer/src/worldDepth";

/** Backdrop plus one terrain style, in the original depth-disabled background band. */
export async function createRawBackdrop(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  samples: 1 | 4,
) {
  const release: (() => void)[] = [];
  let disposed = false;
  const own = <T extends { destroy(): void }>(r: T): T => {
    release.push(() => r.destroy());
    return r;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of release.reverse()) f();
  };
  const check = () => {
    if (disposed) throw Error("Backdrop disposed");
  };
  const finish = beginGpuAdmission(device);
  try {
    const backdrop = own(makeVertexBuffer(device, "backdrop rectangle", new Float32Array(12)));
    const terrain = own(
      makeVertexBuffer(device, "terrain underlay rectangle", new Float32Array(12)),
    );
    const indices = own(makeIndexBuffer(device, "backdrop indices", BACKDROP_INDICES));
    const empty = device.createBindGroupLayout({ entries: [] }),
      emptyGroup = device.createBindGroup({ layout: empty, entries: [] });
    const layout = device.createPipelineLayout({
      bindGroupLayouts: [cameraLayout, empty, empty, environment.layout],
    });
    const pipelines = {} as Record<BackdropKind, GPURenderPipeline>;
    const compilation = (["backdrop", "default", "wide-detail"] as const).map(async (kind) => {
      const module = device.createShaderModule({ code: backdropShader(environment.shader, kind) });
      pipelines[kind] = await device.createRenderPipelineAsync({
        layout,
        vertex: {
          module,
          entryPoint: "vertex",
          buffers: [
            {
              arrayStride: 12,
              attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
            },
          ],
        },
        fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
        primitive: { cullMode: "back" },
        depthStencil: battleDepthBypass(),
        multisample: { count: samples },
      });
    });
    await Promise.all([finish(), ...compilation]);
    let style: "default" | "wide-detail" = "default";
    return {
      setRects(
        terrainRect: readonly [number, number, number, number],
        backdropRect: readonly [number, number, number, number],
      ) {
        check();
        for (const [buffer, [x, y, w, h]] of [
          [terrain, terrainRect],
          [backdrop, backdropRect],
        ] as const)
          device.queue.writeBuffer(buffer, 0, backdropVertices([x, y, w, h]));
      },
      setStyle(value: "default" | "wide-detail") {
        check();
        style = value;
      },
      encode(pass: GPURenderPassEncoder, camera: GPUBindGroup, only?: BackdropKind) {
        check();
        pass.setBindGroup(0, camera);
        pass.setBindGroup(1, emptyGroup);
        pass.setBindGroup(2, emptyGroup);
        pass.setBindGroup(3, environment.bindGroup);
        pass.setIndexBuffer(indices, "uint16");
        for (const kind of only ? [only] : (["backdrop", style] as const)) {
          pass.setPipeline(pipelines[kind]);
          pass.setVertexBuffer(0, kind === "backdrop" ? backdrop : terrain);
          pass.drawIndexed(6);
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    await finish();
    throw error;
  }
}
