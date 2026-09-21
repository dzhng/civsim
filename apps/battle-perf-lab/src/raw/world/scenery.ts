import { beginGpuAdmission } from "../../../../../packages/battle-renderer/src/gpuAdmission";
import {
  BATTLE_SCENERY_KINDS,
  packBattleScenery,
} from "../../../../../packages/game-renderer/src/battle/sceneryData";
import {
  SCENERY_PROP_MODELS,
  type SceneryPropId,
} from "../../../../../packages/game-renderer/src/models/shared/sceneryPropRegistry";
import { buildLeafAtlas } from "../../../../../packages/game-renderer/src/models/shared/leafAtlas";
import type { CampaignSceneryInstance } from "../../../../../packages/game-renderer/src/campaign/sceneryPass";
import { uploadImageTexture } from "../../../../../packages/renderer-core/src/imageTexture";
import {
  GrowableBuffer,
  makeVertexBuffer,
  makeIndexBuffer,
} from "../../../../../packages/renderer-core/src/gpuBuffers";
import { sceneryShader } from "../../../../../packages/battle-renderer/src/shaders/scenery";
import type { RawEnvironment } from "./environment";
import { battleWorldDepth } from "../../../../../packages/battle-renderer/src/worldDepth";

/** Battle trees and rocks use the shared authored opaque mesh for beauty and
 * source-equivalent directional casting. Devices/camera/environment remain borrowed. */
export async function createRawScenery(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  samples: 1 | 4,
) {
  const releases: (() => void)[] = [];
  let disposed = false;
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T): T => {
    releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  const assertLive = () => {
    if (disposed) throw Error("Scenery is disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const release of releases.reverse()) release();
  };
  let finish: ReturnType<typeof beginGpuAdmission> | undefined;
  let pipelinesReady: Promise<[GPURenderPipeline, GPURenderPipeline]> | undefined;
  try {
    const atlas = buildLeafAtlas();
    const leaf = own(
      await uploadImageTexture(
        device,
        { width: atlas.width, height: atlas.height, data: atlas.rgba },
        { colorSpace: "linear", generateMipmaps: true },
      ),
    );
    finish = beginGpuAdmission(device);
    const leafSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    const leafLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const leafGroup = device.createBindGroup({
      layout: leafLayout,
      entries: [
        { binding: 0, resource: leaf.createView() },
        { binding: 1, resource: leafSampler },
      ],
    });
    const emptyLayout = device.createBindGroupLayout({ entries: [] }),
      emptyGroup = device.createBindGroup({ layout: emptyLayout, entries: [] });
    const layout = (light: GPUBindGroupLayout) =>
      device.createPipelineLayout({
        bindGroupLayouts: [cameraLayout, leafLayout, emptyLayout, light],
      });
    const module = device.createShaderModule({
      code: sceneryShader(environment.shader, environment.shadows),
    });
    const vertex: GPUVertexState = {
      module,
      entryPoint: "vertex",
      buffers: [
        {
          arrayStride: 40,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x3" },
            { shaderLocation: 2, offset: 24, format: "float32x4" },
          ],
        },
        { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: "float32x2" }] },
        {
          arrayStride: 16,
          stepMode: "instance",
          attributes: [{ shaderLocation: 4, offset: 0, format: "float32x4" }],
        },
        {
          arrayStride: 16,
          stepMode: "instance",
          attributes: [{ shaderLocation: 5, offset: 0, format: "float32x4" }],
        },
      ],
    };
    const shared = {
      vertex,
      primitive: { cullMode: "none" as const },
      depthStencil: battleWorldDepth("read-write"),
    };
    const beautyReady = device.createRenderPipelineAsync({
      ...shared,
      layout: layout(environment.layout),
      multisample: { count: samples },
      fragment: { module, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
    });
    const shadowReady = device.createRenderPipelineAsync({
      ...shared,
      layout: layout(environment.casterLayout),
      fragment: { module, entryPoint: "shadowFragment", targets: [] },
    });
    pipelinesReady = Promise.all([beautyReady, shadowReady]);
    const buckets = new Map<
      SceneryPropId,
      {
        vertices: GPUBuffer;
        uvs: GPUBuffer;
        indices: GPUBuffer;
        indexCount: number;
        pose: GrowableBuffer;
        style: GrowableBuffer;
        count: number;
      }
    >();
    for (const kind of BATTLE_SCENERY_KINDS) {
      const model = SCENERY_PROP_MODELS[kind].build().opaque;
      buckets.set(kind, {
        vertices: own(makeVertexBuffer(device, `scenery ${kind} vertices`, model.vertices)),
        uvs: own(
          makeVertexBuffer(
            device,
            `scenery ${kind} UV`,
            model.uvs ?? new Float32Array((model.vertices.length / 10) * 2).fill(-1),
          ),
        ),
        indices: own(makeIndexBuffer(device, `scenery ${kind} indices`, model.indices)),
        indexCount: model.indices.length,
        pose: own(new GrowableBuffer(device, `scenery ${kind} pose`, GPUBufferUsage.VERTEX, 16)),
        style: own(new GrowableBuffer(device, `scenery ${kind} style`, GPUBufferUsage.VERTEX, 16)),
        count: 0,
      });
    }
    const [, [beauty, shadow]] = await Promise.all([finish(), pipelinesReady]);
    let count = 0;
    return {
      upload(instances: readonly CampaignSceneryInstance[]) {
        assertLive();
        count = 0;
        for (const [kind, bucket] of buckets) {
          const data = packBattleScenery(kind, instances);
          bucket.pose.write(data.pose);
          bucket.style.write(data.style);
          bucket.count = data.count;
          count += data.count;
        }
      },
      draw(pass: GPURenderPassEncoder, camera: GPUBindGroup, audience: "main" | "shadow" = "main") {
        assertLive();
        if (!count) return;
        pass.setPipeline(audience === "main" ? beauty : shadow);
        pass.setBindGroup(0, camera);
        pass.setBindGroup(1, leafGroup);
        pass.setBindGroup(2, emptyGroup);
        pass.setBindGroup(
          3,
          audience === "main" ? environment.bindGroup : environment.casterBindGroup,
        );
        for (const bucket of buckets.values()) {
          if (!bucket.count) continue;
          pass.setVertexBuffer(0, bucket.vertices);
          pass.setVertexBuffer(1, bucket.uvs);
          pass.setVertexBuffer(2, bucket.pose.buffer);
          pass.setVertexBuffer(3, bucket.style.buffer);
          pass.setIndexBuffer(bucket.indices, "uint16");
          pass.drawIndexed(bucket.indexCount, bucket.count);
        }
      },
      stats: () => ({ scenery: count }),
      dispose,
    };
  } catch (error) {
    const settled = Promise.allSettled([finish?.(), pipelinesReady]);
    dispose();
    await settled;
    throw error;
  }
}
