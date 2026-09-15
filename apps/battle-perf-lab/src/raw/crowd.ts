import { crowdRigGroups, packCrowdFrame, type CrowdAudiencePlan } from "../crowdData";
import type { AppearanceBundle } from "../../../../packages/soldier-assets/src/appearanceBundle";
import {
  packSoldierVertices,
  SOLDIER_VERTEX_LAYOUT,
  type SoldierMeshData,
} from "../../../../packages/soldier-assets/src/mesh";
import {
  packSoldierMaterials,
  SOLDIER_MATERIAL_ROWS,
  SOLDIER_TEXTURE_COLOR_SPACES,
  type SoldierSurface,
  type SoldierTextureChannel,
} from "../../../../packages/soldier-assets/src/material";
import { type CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import { RawPosePalette } from "../../../../packages/renderer-core/src/rawPosePalette";
import type { GpuDeviceCaps } from "../../../../packages/renderer-core/src/capabilities";
import {
  GrowableBuffer,
  makeVertexBuffer,
  makeIndexBuffer,
} from "../../../../packages/renderer-core/src/gpuBuffers";
import { GPU_DEPTH_FORMAT } from "../../../../packages/renderer-core/src/depthContract";
import { uploadImageTexture } from "../../../../packages/renderer-core/src/imageTexture";
import { soldierShader, type SoldierDiagnostic } from "../shaders/soldier";
import type { RawEnvironment } from "./environment";

type Audience = "main" | "shadow";
type Bucket = {
  mesh: SoldierMeshData;
  vertices: GPUBuffer;
  indices: GPUBuffer;
  instances: Record<Audience, GrowableBuffer>;
  counts: Record<Audience, number>;
  palette: RawPosePalette;
  material: GPUBindGroup;
  beauty: GPURenderPipeline;
  depth: GPURenderPipeline;
};
/** Mesh tiers only; the caller owns the canonical visibility plan and must draw
 * its reported impostors separately. Depth encoding supplies casters; receiving
 * directional shadows remains a separate world-lighting integration contract. */
export async function createRawCrowd(
  device: GPUDevice,
  caps: GpuDeviceCaps,
  assets: Record<number, AppearanceBundle>,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  {
    sampleCount = 4,
    diagnostic,
    format = "rgba16float",
    invariantPosition = true,
  }: {
    sampleCount?: 1 | 4;
    diagnostic?: SoldierDiagnostic;
    format?: "rgba16float" | "rgba32float";
    invariantPosition?: boolean;
  } = {},
) {
  const owned = new Set<GPUBuffer | GPUTexture>();
  const palettes: RawPosePalette[] = [];
  const instanceBuffers = new Set<GrowableBuffer>();
  const ownInstances = (buffer: GrowableBuffer) => {
    instanceBuffers.add(buffer);
    return buffer;
  };
  const buckets = new Map<number, Bucket[]>();
  let ready = false,
    disposed = false,
    impostorCount = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const p of palettes) p.dispose();
    for (const buffer of instanceBuffers) buffer.dispose();
    for (const r of owned) r.destroy();
  };
  const assertLive = () => {
    if (disposed) throw new Error("Raw crowd is disposed");
  };
  const own = <T extends GPUBuffer | GPUTexture>(r: T): T => {
    owned.add(r);
    return r;
  };
  try {
    if (!Object.keys(assets).length) throw new Error("Raw crowd requires loaded appearances");
    const paletteLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });
    const materialLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "unfilterable-float" },
        },
        ...[1, 3, 5].flatMap((binding) => [
          {
            binding,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" as const },
          },
          {
            binding: binding + 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" as const },
          },
        ]),
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [cameraLayout, paletteLayout, materialLayout, environment.layout],
    });
    const casterPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [cameraLayout, paletteLayout, materialLayout, environment.casterLayout],
    });
    const offsets = SOLDIER_VERTEX_LAYOUT.offsets;
    const vertex: GPUVertexBufferLayout = {
      arrayStride: SOLDIER_VERTEX_LAYOUT.strideFloats * 4,
      attributes: [
        [0, offsets.position, "float32x3"],
        [1, offsets.normal, "float32x3"],
        [2, offsets.color, "float32x4"],
        [3, offsets.joints, "float32x4"],
        [4, offsets.weights, "float32x4"],
        [5, offsets.uv, "float32x2"],
        [6, offsets.tangent, "float32x4"],
        [7, offsets.material, "float32"],
        [8, offsets.faction, "float32"],
      ].map(([shaderLocation, offset, format]) => ({
        shaderLocation: shaderLocation as number,
        offset: (offset as number) * 4,
        format: format as GPUVertexFormat,
      })),
    };
    const instance: GPUVertexBufferLayout = {
      arrayStride: 48,
      stepMode: "instance",
      attributes: [
        { shaderLocation: 9, offset: 0, format: "float32x4" },
        { shaderLocation: 10, offset: 16, format: "float32x4" },
        { shaderLocation: 11, offset: 32, format: "float32x4" },
      ],
    };
    const surfaceCache = new Map<
      SoldierSurface,
      { binding: GPUBindGroup; images: { baseColor: boolean; normal: boolean; orm: boolean } }
    >();
    const prepareSurface = async (surface: SoldierSurface) => {
      const cached = surfaceCache.get(surface);
      if (cached) return cached;
      const table = own(
        device.createTexture({
          size: [surface.materials.length, SOLDIER_MATERIAL_ROWS],
          format: "rgba32float",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        }),
      );
      device.queue.writeTexture(
        { texture: table },
        packSoldierMaterials(surface.materials),
        { bytesPerRow: surface.materials.length * 16 },
        [surface.materials.length, SOLDIER_MATERIAL_ROWS],
      );
      const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: table.createView() }];
      const images = {
        baseColor: !!surface.textures.baseColor,
        normal: !!surface.textures.normal,
        orm: !!surface.textures.orm,
      };
      for (const [i, channel] of (
        ["baseColor", "normal", "orm"] as SoldierTextureChannel[]
      ).entries()) {
        const definition = surface.textures[channel];
        let image: GPUTexture;
        if (definition) {
          const bitmap = await createImageBitmap(
            new Blob([definition.image], { type: definition.mimeType }),
            { colorSpaceConversion: "none", premultiplyAlpha: "none", imageOrientation: "none" },
          );
          try {
            image = own(
              await uploadImageTexture(device, bitmap, {
                colorSpace: SOLDIER_TEXTURE_COLOR_SPACES[channel],
                generateMipmaps: definition.sampler.mipmapFilter !== "none",
              }),
            );
          } finally {
            bitmap.close();
          }
        } else {
          image = own(
            device.createTexture({
              size: [1, 1],
              format: channel === "baseColor" ? "rgba8unorm-srgb" : "rgba8unorm",
              usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            }),
          );
          device.queue.writeTexture(
            { texture: image },
            new Uint8Array([255, 255, 255, 255]),
            {},
            [1, 1],
          );
        }
        const s = definition?.sampler;
        const sampler = device.createSampler({
          magFilter: s?.magFilter ?? "linear",
          minFilter: s?.minFilter ?? "linear",
          mipmapFilter: s?.mipmapFilter === "none" ? "nearest" : (s?.mipmapFilter ?? "nearest"),
          addressModeU: s?.wrapS ?? "clamp-to-edge",
          addressModeV: s?.wrapT ?? "clamp-to-edge",
          ...(s?.mipmapFilter === "none" ? { lodMaxClamp: 0 } : {}),
        });
        entries.push(
          { binding: 1 + i * 2, resource: image.createView() },
          { binding: 2 + i * 2, resource: sampler },
        );
      }
      const result = {
        binding: device.createBindGroup({ layout: materialLayout, entries }),
        images,
      };
      surfaceCache.set(surface, result);
      return result;
    };
    const rigGroups = crowdRigGroups(assets);
    const paletteFor = new Map<number, RawPosePalette>();
    for (const group of rigGroups) {
      const first = Object.values(group)[0];
      const palette = new RawPosePalette(
        device,
        caps,
        first.rig,
        first.animation,
        group,
        `native crowd rig${palettes.length}`,
        paletteLayout,
      );
      palettes.push(palette);
      for (const id of Object.keys(group)) paletteFor.set(Number(id), palette);
    }
    const pipelines = new Map<string, { beauty: GPURenderPipeline; depth: GPURenderPipeline }>();
    for (const [id, bundle] of Object.entries(assets)) {
      const classId = Number(id),
        palette = paletteFor.get(classId)!,
        surface = await prepareSurface(bundle.surface);
      const key = `${palette.bones}/${JSON.stringify(surface.images)}`;
      let pipeline = pipelines.get(key);
      if (!pipeline) {
        const module = device.createShaderModule({
          code: soldierShader(
            palette.bones,
            environment.shader,
            surface.images,
            diagnostic,
            invariantPosition,
            false,
            environment.shadows,
          ),
        });
        const state = {
          layout: pipelineLayout,
          vertex: { module, entryPoint: "vertex", buffers: [vertex, instance] },
          primitive: { topology: "triangle-list" as const, cullMode: "none" as const },
          depthStencil: {
            format: GPU_DEPTH_FORMAT,
            depthWriteEnabled: true,
            depthCompare: "greater-equal" as const,
          },
        };
        const [beauty, depth] = await Promise.all([
          device.createRenderPipelineAsync({
            ...state,
            multisample: { count: sampleCount },
            fragment: { module, entryPoint: "fragment", targets: [{ format }] },
          }),
          device.createRenderPipelineAsync({
            ...state,
            layout: casterPipelineLayout,
            multisample: { count: 1 },
          }),
        ]);
        pipeline = { beauty, depth };
        pipelines.set(key, pipeline);
      }
      const list: Bucket[] = [];
      buckets.set(classId, list);
      for (const [lod, mesh] of bundle.tiers.entries())
        list.push({
          mesh,
          vertices: own(
            makeVertexBuffer(device, `native crowd ${classId}/${lod}`, packSoldierVertices(mesh)),
          ),
          indices: own(
            makeIndexBuffer(device, `native crowd indices${classId}/${lod}`, mesh.indices),
          ),
          instances: {
            main: ownInstances(
              new GrowableBuffer(device, "native crowd main", GPUBufferUsage.VERTEX, 256 * 48),
            ),
            shadow: ownInstances(
              new GrowableBuffer(device, "native crowd shadow", GPUBufferUsage.VERTEX, 256 * 48),
            ),
          },
          counts: { main: 0, shadow: 0 },
          palette,
          material: surface.binding,
          ...pipeline,
        });
    }
    return {
      upload(instances: readonly CrowdInstance[], plan: CrowdAudiencePlan) {
        assertLive();
        ready = false;
        impostorCount = 0;
        const packed = packCrowdFrame(instances, plan, rigGroups);
        impostorCount = packed.impostorsPending;
        palettes.forEach((palette, i) => {
          const indices = packed.rigIndices[i];
          palette.upload(
            indices.length,
            (j) => instances[indices[j]].playback ?? instances[indices[j]],
            (j) => instances[indices[j]].classId,
          );
        });
        for (const [id, list] of buckets)
          for (const [lod, b] of list.entries())
            for (const audience of ["main", "shadow"] as const) {
              const data = packed.packed.get(id)![audience][lod];
              b.counts[audience] = data.length / 12;
              if (data.length) b.instances[audience].write(data);
            }
        ready = true;
      },
      precompute(encoder: GPUCommandEncoder) {
        assertLive();
        if (!ready) throw new Error("Crowd frame is not ready");
        for (const p of palettes) p.precompute(encoder);
      },
      draw(pass: GPURenderPassEncoder, camera: GPUBindGroup, audience: Audience = "main") {
        assertLive();
        if (!ready) throw new Error("Crowd frame is not ready");
        pass.setBindGroup(0, camera);
        pass.setBindGroup(
          3,
          audience === "shadow" ? environment.casterBindGroup : environment.bindGroup,
        );
        for (const list of buckets.values())
          for (const b of list) {
            const count = b.counts[audience];
            if (!count) continue;
            pass.setPipeline(audience === "main" ? b.beauty : b.depth);
            pass.setBindGroup(1, b.palette.bindGroup);
            pass.setBindGroup(2, b.material);
            pass.setVertexBuffer(0, b.vertices);
            pass.setVertexBuffer(1, b.instances[audience].buffer);
            pass.setIndexBuffer(
              b.indices,
              b.mesh.indices instanceof Uint16Array ? "uint16" : "uint32",
            );
            pass.drawIndexed(b.mesh.indices.length, count);
          }
      },
      stats() {
        const result = {
          mainTriangles: 0,
          shadowTriangles: 0,
          mainDraws: 0,
          shadowDraws: 0,
          impostorsPending: impostorCount,
          pose: palettes.map((p) => p.stats()),
        };
        for (const list of buckets.values())
          for (const b of list)
            for (const audience of ["main", "shadow"] as const) {
              const n = b.counts[audience];
              if (n) {
                result[`${audience}Triangles`] += (b.mesh.indices.length / 3) * n;
                result[`${audience}Draws`]++;
              }
            }
        return result;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
