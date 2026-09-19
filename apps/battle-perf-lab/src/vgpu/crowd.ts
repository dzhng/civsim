import { draw, geometry, texture, sampler, type Gpu, type FramePass } from "vgpu";
import type { AppearanceBundle } from "../../../../packages/soldier-assets/src/appearanceBundle";
import {
  packSoldierVertices,
  SOLDIER_VERTEX_LAYOUT,
} from "../../../../packages/soldier-assets/src/mesh";
import {
  packSoldierMaterials,
  SOLDIER_MATERIAL_ROWS,
  SOLDIER_TEXTURE_COLOR_SPACES,
  type SoldierSurface,
} from "../../../../packages/soldier-assets/src/material";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import {
  crowdRigGroups,
  CrowdFramePacker,
  type CrowdAudiencePlan,
  type CrowdAudience,
} from "../../../../packages/battle-renderer/src/crowdData";
import { crowdImage, crowdSampler, crowdTextureChannels } from "../crowdMaterial";
import { soldierShader } from "../../../../packages/battle-renderer/src/shaders/soldier";
import { createVgpuPosePalette } from "./posePalette";
import { createVgpuImageTexture } from "./imageTexture";
import type { VgpuEnvironment } from "./environment";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
/** vgpu geometry/pipelines/resources; borrowed context, camera and environment. */
export async function createVgpuCrowd(
  gpu: Gpu,
  assets: Record<number, AppearanceBundle>,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  env: VgpuEnvironment,
  samples: 1 | 4 = 4,
) {
  const device = gpu.device.gpu,
    groups = crowdRigGroups(assets),
    packer = new CrowdFramePacker(groups),
    owned: (() => void)[] = [];
  let uploading = false;
  let disposed = false,
    ready = false,
    impostorsPending = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of owned.reverse()) f();
  };
  const assertReady = () => {
    if (disposed || !ready) throw new Error("vgpu crowd frame is not ready");
  };
  const finishAdmission = beginGpuAdmission(device);
  try {
    const palettes: Awaited<ReturnType<typeof createVgpuPosePalette>>[] = [];
    for (const group of groups) {
      const a = Object.values(group)[0],
        p = await createVgpuPosePalette(device, a.rig, a.animation, group);
      palettes.push(p);
      owned.push(p.dispose);
    }
    const materials = new Map<SoldierSurface, Record<string, unknown>>();
    const prepare = async (surface: SoldierSurface) => {
      if (materials.has(surface)) return materials.get(surface)!;
      const table = texture(gpu, {
        kind: "2d",
        size: [surface.materials.length, SOLDIER_MATERIAL_ROWS],
        format: "rgba32float",
        usage: ["texture_binding", "copy_dst"],
      });
      owned.push(() => table.destroy());
      device.queue.writeTexture(
        { texture: table.gpu },
        packSoldierMaterials(surface.materials),
        { bytesPerRow: surface.materials.length * 16 },
        [surface.materials.length, SOLDIER_MATERIAL_ROWS],
      );
      const set: Record<string, unknown> = { materialTable: table };
      for (const channel of crowdTextureChannels) {
        const bitmap = await crowdImage(surface, channel);
        try {
          const t = await createVgpuImageTexture(device, bitmap, {
            colorSpace: SOLDIER_TEXTURE_COLOR_SPACES[channel],
            generateMipmaps:
              !!surface.textures[channel] &&
              surface.textures[channel]!.sampler.mipmapFilter !== "none",
          });
          owned.push(t.dispose);
          set[channel === "baseColor" ? "baseMap" : `${channel}Map`] = t.texture;
          set[channel === "baseColor" ? "baseSampler" : `${channel}Sampler`] = sampler(
            gpu,
            crowdSampler(surface, channel),
          );
        } finally {
          bitmap.close();
        }
      }
      materials.set(surface, set);
      return set;
    };
    const buckets: {
      id: number;
      lod: number;
      audience: CrowdAudience;
      triangles: number;
      readonly count: number;
      update(data: Float32Array<ArrayBuffer>): Promise<void>;
      draw(pass: FramePass, cameraBuffer: typeof camera): void;
    }[] = [];
    for (const [idText, asset] of Object.entries(assets)) {
      const id = Number(idText),
        rig = groups.findIndex((g) => id in g),
        material = await prepare(asset.surface);
      for (const [lod, mesh] of asset.tiers.entries()) {
        const vertexData = packSoldierVertices(mesh).slice(),
          indexData = Uint32Array.from(mesh.indices);
        const vertices = gpu.device.createBuffer({
          size: vertexData.byteLength,
          usage: ["vertex", "copy_dst"],
        });
        owned.push(() => vertices.destroy());
        vertices.write(vertexData);
        const indices = gpu.device.createBuffer({
          size: indexData.byteLength,
          usage: ["index", "copy_dst"],
        });
        owned.push(() => indices.destroy());
        indices.write(indexData);
        const images = {
          baseColor: !!asset.surface.textures.baseColor,
          normal: !!asset.surface.textures.normal,
          orm: !!asset.surface.textures.orm,
        };
        for (const audience of ["main", "shadow"] as const) {
          const shader =
            soldierShader(
              palettes[rig].bones,
              audience === "shadow" ? env.casterShader : env.shader,
              images,
              undefined,
              true,
              audience === "shadow",
              env.shadows,
            ) +
            (audience === "shadow"
              ? "@fragment fn shadowFragment()->@location(0) vec4f {return vec4f(0);}"
              : "");
          const makeGeometry = (n: number) =>
            geometry(gpu, {
              vertexCount: mesh.positions.length / 3,
              buffers: [
                {
                  buffer: vertices.gpu,
                  stride: SOLDIER_VERTEX_LAYOUT.strideFloats * 4,
                  attributes: {
                    position: "float32x3",
                    normal: "float32x3",
                    color: "float32x4",
                    joints: "float32x4",
                    weights: "float32x4",
                    uv: "float32x2",
                    tangent: "float32x4",
                    material: "float32",
                    factionMask: "float32",
                  },
                },
                {
                  data: new Float32Array(n * 12),
                  stride: 48,
                  stepMode: "instance",
                  attributes: { inst0: "float32x4", inst1: "float32x4", inst2: "float32x4" },
                },
              ],
              // vgpu forwards index bytes directly; uint32 keeps odd triangle counts four-byte aligned.
              indexBuffer: indices.gpu,
              indexFormat: "uint32",
              indexCount: mesh.indices.length,
            });
          let geometryNow = makeGeometry(256),
            capacity = 256,
            count = 0;
          owned.push(() => geometryNow.destroy());
          const makeDraw = (mesh = geometryNow) =>
            draw(gpu, {
              shader,
              geometry: mesh,
              depth: { write: true, compare: "greater-equal" },
              cull: "none",
              ...(audience === "shadow" ? { writeMask: [] } : {}),
              set: {
                cam: camera,
                palette: palettes[rig].buffer,
                ...material,
                ...(audience === "shadow" ? env.casterBindings : env.bindings),
              },
            });
          let render = makeDraw();
          const target = {
            colors: audience === "main" ? ["rgba16float" as const] : ["rgba8unorm" as const],
            depth: "depth32float" as const,
            sampleCount: audience === "main" ? samples : 1,
          };
          await render.compile(target);
          buckets.push({
            id,
            lod,
            audience,
            triangles: mesh.indices.length / 3,
            get count() {
              return count;
            },
            async update(data: Float32Array<ArrayBuffer>) {
              count = data.length / 12;
              if (count > capacity) {
                const finish = beginGpuAdmission(device),
                  nextCapacity = Math.max(count, capacity * 2);
                let next: ReturnType<typeof makeGeometry> | undefined;
                try {
                  next = makeGeometry(nextCapacity);
                  const nextDraw = makeDraw(next);
                  await nextDraw.compile(target);
                  await finish();
                  if (disposed) throw new Error("Crowd disposed during growth");
                  geometryNow.destroy();
                  geometryNow = next;
                  render = nextDraw;
                  capacity = nextCapacity;
                } catch (error) {
                  next?.destroy();
                  try {
                    await finish();
                  } catch (admissionError) {
                    if (admissionError !== error)
                      throw new AggregateError([error, admissionError], "Crowd growth failed");
                  }
                  throw error;
                }
              }
              if (count) geometryNow.buffers[1].write(data);
              render.set({ palette: palettes[rig].buffer });
            },
            draw(pass: FramePass, cameraBuffer: typeof camera) {
              if (count) {
                render.set({ cam: cameraBuffer });
                pass.draw(render, { instances: count });
              }
            },
          });
        }
      }
    }
    await finishAdmission();
    return {
      async upload(instances: readonly CrowdInstance[], plan: CrowdAudiencePlan) {
        if (disposed) throw new Error("vgpu crowd disposed");
        if (uploading) throw new Error("Crowd upload already pending");
        uploading = true;
        try {
          ready = false;
          const p = packer.pack(instances, plan);
          impostorsPending = p.impostorsPending;
          for (let i = 0; i < palettes.length; i++) {
            if (disposed) throw new Error("Crowd disposed during upload");
            const indices = p.rigIndices[i];
            await palettes[i].upload(
              indices.length,
              (j) => instances[indices[j]].playback ?? instances[indices[j]],
              (j) => instances[indices[j]].classId,
            );
          }
          for (const b of buckets) {
            if (disposed) throw new Error("Crowd disposed during upload");
            await b.update(p.packed.get(b.id)![b.audience][b.lod]);
          }
          if (disposed) throw new Error("Crowd disposed during upload");
          ready = true;
        } finally {
          uploading = false;
        }
      },
      precompute() {
        assertReady();
        for (const p of palettes) p.precompute();
      },
      draw(
        pass: FramePass,
        audience: CrowdAudience = "main",
        cameraBuffer: typeof camera = camera,
      ) {
        assertReady();
        for (const b of buckets) if (b.audience === audience) b.draw(pass, cameraBuffer);
      },
      stats() {
        return {
          clipInvariant: true,
          mainTriangles: buckets
            .filter((b) => b.audience === "main")
            .reduce((n, b) => n + b.count * b.triangles, 0),
          shadowTriangles: buckets
            .filter((b) => b.audience === "shadow")
            .reduce((n, b) => n + b.count * b.triangles, 0),
          mainDraws: buckets.filter((b) => b.audience === "main" && b.count).length,
          shadowDraws: buckets.filter((b) => b.audience === "shadow" && b.count).length,
          impostorsPending,
          pose: palettes.map((p) => p.stats()),
        };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    try {
      await finishAdmission();
    } catch (admissionError) {
      if (admissionError !== error)
        throw new AggregateError([error, admissionError], "vgpu crowd admission failed");
    }
    throw error;
  }
}
