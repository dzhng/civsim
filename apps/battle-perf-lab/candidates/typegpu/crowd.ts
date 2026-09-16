import { tgpu, d, type TgpuBindGroup, type TgpuRenderPass } from "typegpu";
import type { AppearanceBundle } from "../../../../packages/soldier-assets/src/appearanceBundle";
import { packSoldierVertices } from "../../../../packages/soldier-assets/src/mesh";
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
} from "../../src/crowdData";
import { crowdImage, crowdSampler, crowdTextureChannels } from "../../src/crowdMaterial";
import { createTypegpuPosePalette } from "./posePalette";
import { createTypegpuImageTexture } from "./imageTexture";
import { typegpuTextureBytes } from "./textureUpload";
import {
  crowdVertexAlgorithm,
  crowdFragmentAlgorithm,
  materialLayout,
  SoldierVertex,
} from "./crowdShader";
import type { TypegpuEnvironment } from "./environment";
import { beginGpuAdmission } from "../../src/gpuAdmission";
const Vertex = d.unstruct({
  position: d.vec3f,
  normal: d.vec3f,
  color: d.vec4f,
  joints: d.vec4f,
  weights: d.vec4f,
  uv: d.vec2f,
  tangent: d.vec4f,
  material: d.f32,
  factionMask: d.f32,
});
const Instance = d.unstruct({ inst0: d.vec4f, inst1: d.vec4f, inst2: d.vec4f });
const vertexLayout = tgpu.vertexLayout(d.disarrayOf(Vertex)),
  instanceLayout = tgpu.vertexLayout(d.disarrayOf(Instance), "instance");
const varyings = {
  position: d.builtin.position,
  world: d.location(0, d.vec3f),
  normal: d.location(1, d.vec3f),
  tangent: d.location(2, d.vec3f),
  uv: d.location(3, d.vec2f),
  color: d.location(4, d.vec3f),
  material: d.location(5, d.interpolate("flat", d.u32)),
  factionMask: d.location(6, d.f32),
  properties: d.location(7, d.vec3f),
  tangentSign: d.location(8, d.interpolate("flat", d.f32)),
  geometryNormalView: d.location(9, d.vec3f),
};
/** Typed palettes, vertex/material storage and beauty/depth encoding; borrowed world resources. */
export async function createTypegpuCrowd(
  device: GPUDevice,
  assets: Record<number, AppearanceBundle>,
  camera: TgpuBindGroup,
  env: TypegpuEnvironment,
  samples: 1 | 4 = 4,
) {
  const root = tgpu.initFromDevice({ device }),
    groups = crowdRigGroups(assets),
    packer = new CrowdFramePacker(groups),
    owned: (() => void)[] = [];
  let uploading = false;
  let disposed = false,
    ready = false,
    impostorsPending = 0;
  const own = <T extends { destroy(): void }>(x: T) => {
    owned.push(() => x.destroy());
    return x;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const f of owned.reverse()) f();
    root.destroy();
  };
  const assertReady = () => {
    if (disposed || !ready) throw new Error("TypeGPU crowd frame is not ready");
  };
  const finishAdmission = beginGpuAdmission(device);
  try {
    const palettes: Awaited<ReturnType<typeof createTypegpuPosePalette>>[] = [];
    for (const g of groups) {
      const a = Object.values(g)[0],
        p = await createTypegpuPosePalette(device, a.rig, a.animation, g);
      palettes.push(p);
      owned.push(p.dispose);
    }
    const materials = new Map<SoldierSurface, TgpuBindGroup<typeof materialLayout.entries>>();
    async function prepare(
      surface: SoldierSurface,
    ): Promise<TgpuBindGroup<typeof materialLayout.entries>> {
      const cached = materials.get(surface);
      if (cached) return cached;
      const table = own(
        root
          .createTexture({
            size: [surface.materials.length, SOLDIER_MATERIAL_ROWS],
            format: "rgba32float",
          })
          .$usage("sampled"),
      );
      table.write(typegpuTextureBytes(packSoldierMaterials(surface.materials)));
      const images = [];
      for (const channel of crowdTextureChannels) {
        const bitmap = await crowdImage(surface, channel);
        try {
          const t = await createTypegpuImageTexture(device, bitmap, {
            colorSpace: SOLDIER_TEXTURE_COLOR_SPACES[channel],
            generateMipmaps:
              !!surface.textures[channel] &&
              surface.textures[channel]!.sampler.mipmapFilter !== "none",
          });
          owned.push(t.dispose);
          images.push(t.texture);
        } finally {
          bitmap.close();
        }
      }
      const group = root.createBindGroup(materialLayout, {
        materialTable: table.createView(d.texture2d(d.f32), { sampleType: "unfilterable-float" }),
        baseMap: images[0],
        baseSampler: root.createSampler(crowdSampler(surface, "baseColor")),
        normalMap: images[1],
        normalSampler: root.createSampler(crowdSampler(surface, "normal")),
        ormMap: images[2],
        ormSampler: root.createSampler(crowdSampler(surface, "orm")),
      });
      materials.set(surface, group);
      return group;
    }
    const buckets: {
      id: number;
      lod: number;
      audience: CrowdAudience;
      triangles: number;
      readonly count: number;
      update(data: Float32Array<ArrayBuffer>): Promise<void>;
      draw(pass: TgpuRenderPass, cameraGroup: TgpuBindGroup): void;
    }[] = [];
    for (const [idText, asset] of Object.entries(assets)) {
      const id = Number(idText),
        rig = groups.findIndex((g) => id in g),
        group = await prepare(asset.surface),
        fragmentAlgorithm = crowdFragmentAlgorithm(
          {
            baseColor: !!asset.surface.textures.baseColor,
            normal: !!asset.surface.textures.normal,
            orm: !!asset.surface.textures.orm,
          },
          env,
        );
      const makeVertex = (vertexAlgorithm: ReturnType<typeof crowdVertexAlgorithm>) =>
        tgpu.vertexFn({
          in: { ...Vertex.propTypes, ...Instance.propTypes },
          out: varyings,
        })((v) => {
          "use gpu";
          const result = vertexAlgorithm(
            v.position,
            v.normal,
            v.color,
            v.joints,
            v.weights,
            v.uv,
            v.tangent,
            v.material,
            v.factionMask,
            v.inst0,
            v.inst1,
            v.inst2,
          );
          return {
            position: result.position,
            world: result.world,
            normal: result.normal,
            tangent: result.tangent,
            uv: result.uv,
            color: result.color,
            material: result.material,
            factionMask: result.factionMask,
            properties: result.properties,
            tangentSign: result.tangentSign,
            geometryNormalView: result.geometryNormalView,
          };
        });
      const vertex = makeVertex(crowdVertexAlgorithm(palettes[rig].bones, env.layout));
      const casterVertex = makeVertex(crowdVertexAlgorithm(palettes[rig].bones, env.casterLayout));
      const fragment = tgpu.fragmentFn({
        in: { ...varyings, front: d.builtin.frontFacing },
        out: d.vec4f,
      })((v) => {
        "use gpu";
        return fragmentAlgorithm(
          SoldierVertex({
            position: v.position,
            world: v.world,
            normal: v.normal,
            tangent: v.tangent,
            uv: v.uv,
            color: v.color,
            material: v.material,
            factionMask: v.factionMask,
            properties: v.properties,
            tangentSign: v.tangentSign,
            geometryNormalView: v.geometryNormalView,
          }),
          v.front,
        );
      });
      const state = {
        attribs: { ...vertexLayout.attrib, ...instanceLayout.attrib },
        vertex,
        primitive: { topology: "triangle-list" as const, cullMode: "none" as const },
        depthStencil: {
          format: "depth32float" as const,
          depthWriteEnabled: true,
          depthCompare: "greater-equal" as const,
        },
      };
      const beauty = root.createRenderPipeline({
          ...state,
          fragment,
          targets: { format: "rgba16float" },
          multisample: { count: samples },
        }),
        depth = root.createRenderPipeline({ ...state, vertex: casterVertex });
      await Promise.all([beauty.initAsync(), depth.initAsync()]);
      for (let lod = 0; lod < 3; lod++) {
        const mesh = asset.tiers[lod],
          vertices = own(
            root
              .createBuffer(vertexLayout.schemaForCount(mesh.positions.length / 3))
              .$usage("vertex"),
          ),
          indices = own(root.createBuffer(d.arrayOf(d.u32, mesh.indices.length)).$usage("index"));
        vertices.write(packSoldierVertices(mesh).slice().buffer);
        indices.write(Uint32Array.from(mesh.indices).buffer);
        for (const audience of ["main", "shadow"] as const) {
          let capacity = 256,
            count = 0,
            instances = root.createBuffer(instanceLayout.schemaForCount(capacity)).$usage("vertex");
          owned.push(() => instances.destroy());
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
                let next: typeof instances | undefined;
                try {
                  next = root
                    .createBuffer(instanceLayout.schemaForCount(nextCapacity))
                    .$usage("vertex");
                  root.unwrap(next);
                  await finish();
                  if (disposed) throw new Error("Crowd disposed during growth");
                  instances.destroy();
                  instances = next;
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
              if (count) {
                const host = instances.arrayBuffer;
                new Float32Array(host).set(data);
                instances.write(host, { startOffset: 0, endOffset: data.byteLength });
              }
            },
            draw(pass: TgpuRenderPass, cameraGroup: TgpuBindGroup) {
              if (!count) return;
              if (audience === "main")
                beauty
                  .with(cameraGroup)
                  .with(palettes[rig].bindGroup)
                  .with(group)
                  .with(env.group)
                  .with(vertexLayout, vertices)
                  .with(instanceLayout, instances)
                  .withIndexBuffer(indices)
                  .with(pass)
                  .drawIndexed(mesh.indices.length, count);
              else
                depth
                  .with(cameraGroup)
                  .with(palettes[rig].bindGroup)
                  .with(env.casterGroup)
                  .with(vertexLayout, vertices)
                  .with(instanceLayout, instances)
                  .withIndexBuffer(indices)
                  .with(pass)
                  .drawIndexed(mesh.indices.length, count);
            },
          });
        }
      }
    }
    await finishAdmission();
    return {
      async upload(instances: readonly CrowdInstance[], plan: CrowdAudiencePlan) {
        if (disposed) throw new Error("TypeGPU crowd disposed");
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
      precompute(encoder: GPUCommandEncoder) {
        assertReady();
        for (const p of palettes) p.precompute(encoder);
      },
      draw(
        pass: TgpuRenderPass,
        audience: CrowdAudience = "main",
        cameraGroup: TgpuBindGroup = camera,
      ) {
        assertReady();
        for (const b of buckets) if (b.audience === audience) b.draw(pass, cameraGroup);
      },
      stats() {
        return {
          clipInvariant: false,
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
        throw new AggregateError([error, admissionError], "TypeGPU crowd admission failed");
    }
    throw error;
  }
}
