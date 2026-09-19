import { typegpuTextureBytes } from "./textureUpload";
import {
  impostorAtlasLayout,
  type ImpostorAtlasData,
} from "../../../../packages/soldier-assets/src/impostorAtlas";
import { tgpu, d, std, type TgpuBindGroup, type TgpuRenderCommands } from "typegpu";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import { GPU_DEPTH_FORMAT } from "../../../../packages/renderer-core/src/depthContract";
import { packImpostors, type ImpostorView } from "../../../../packages/battle-renderer/src/impostorData";
import { impostorVertexWgsl, impostorSurfaceWgsl } from "../../../../packages/battle-renderer/src/shaders/impostor";
import { linearAlbedoWgsl, factionAccentWgsl } from "../../../../packages/battle-renderer/src/shaders/soldierFaction";
import { typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";

const Instance = d.struct({ instance: d.vec4f, billboardData: d.vec4f, living: d.vec4f });
const instanceLayout = tgpu.vertexLayout((n) => d.arrayOf(Instance, n), "instance");
const Axes = d.struct({ right: d.vec4f, up: d.vec4f });
const bindings = tgpu
  .bindGroupLayout({
    axes: { uniform: Axes, visibility: ["vertex"] },
    albedo: { texture: d.texture2d(), visibility: ["fragment"] },
    normal: { texture: d.texture2d(), visibility: ["fragment"] },
    orm: { texture: d.texture2d(), visibility: ["fragment"] },
    linear: { sampler: "filtering", visibility: ["fragment"] },
  })
  .$idx(1);
const ImpostorVertex = d.struct({ world: d.vec3f, uv: d.vec2f, properties: d.vec4f });
const ImpostorSurface = d.struct({
  base: d.vec3f,
  normal: d.vec3f,
  roughness: d.f32,
  metal: d.f32,
  ao: d.f32,
});
const vertexAlgorithm = tgpu
  .fn(
    [d.u32, d.vec4f, d.vec4f, d.f32, d.vec3f, d.vec3f],
    ImpostorVertex,
  )(impostorVertexWgsl)
  .$uses({ ImpostorVertex });
const linearAlbedo = tgpu.fn([d.vec3f], d.vec3f)(linearAlbedoWgsl);
const factionAccent = tgpu.fn([d.f32], d.vec3f)(factionAccentWgsl).$uses({ linearAlbedo });

/** Owns atlas uploads and instance data; device, camera and typed environment are borrowed.
 * TypeGPU owns resource creation, uploads, pipeline compilation and draw encoding. */
export async function createTypegpuImpostors(
  device: GPUDevice,
  atlas: ImpostorAtlasData,
  environment: TypegpuEnvironment,
  samples = 4,
) {
  const root = tgpu.initFromDevice({ device });
  const placement = impostorAtlasLayout(atlas);
  const owned: { destroy(): void }[] = [];
  let disposed = false,
    count = 0,
    capacity = 512;
  let scopesOpen = false;
  const closeScopes = async () => {
    if (!scopesOpen) return;
    scopesOpen = false;
    const results = await Promise.allSettled([
      device.popErrorScope(),
      device.popErrorScope(),
      device.popErrorScope(),
    ]);
    const errors = results.flatMap((r) =>
      r.status === "rejected" ? [String(r.reason)] : r.value ? [r.value.message] : [],
    );
    if (errors.length) throw new Error(`TypeGPU impostor admission: ${errors.join("; ")}`);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.destroy();
    root.destroy();
  };
  const assertLive = () => {
    if (disposed) throw new Error("TypeGPU impostors disposed");
  };
  try {
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("internal");
    device.pushErrorScope("validation");
    scopesOpen = true;
    let instances = root.createBuffer(instanceLayout.schemaForCount(capacity)).$usage("vertex");
    owned.push(instances);
    const axes = root.createBuffer(Axes).$usage("uniform");
    owned.push(axes);
    const width = atlas.columns * atlas.tileSize,
      height = atlas.rows * atlas.tileSize,
      levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    const upload = (chain: readonly Uint8Array[], format: "rgba8unorm" | "rgba8unorm-srgb") => {
      if (chain.length !== levels) throw new Error("Impostor atlas requires complete mip chains");
      const texture = root
        .createTexture({ size: [width, height], format, mipLevelCount: levels })
        .$usage("sampled");
      owned.push(texture);
      chain.forEach((bytes, mip) => {
        if (bytes.length !== Math.max(1, width >> mip) * Math.max(1, height >> mip) * 4)
          throw new Error("Impostor mip dimensions mismatch");
        texture.write(typegpuTextureBytes(bytes), mip);
      });
      return texture;
    };
    const albedo = upload(atlas.albedo, "rgba8unorm-srgb"),
      normal = upload(atlas.normal, "rgba8unorm"),
      orm = upload(atlas.orm, "rgba8unorm");
    const group = root.createBindGroup(bindings, {
      axes,
      albedo: albedo.createView(),
      normal: normal.createView(),
      orm: orm.createView(),
      linear: root.createSampler({
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
      }),
    });
    const surfaceAlgorithm = tgpu
      .fn(
        [d.vec2f, d.vec4f, d.texture2d(), d.texture2d(), d.texture2d(), d.sampler()],
        ImpostorSurface,
      )(impostorSurfaceWgsl(atlas.columns, atlas.rows))
      .$uses({ ImpostorSurface, factionAccent });
    const vertex = tgpu.vertexFn({
      in: {
        index: d.builtin.vertexIndex,
        instance: d.vec4f,
        billboardData: d.vec4f,
        living: d.vec4f,
      },
      out: { position: d.builtin.position, world: d.vec3f, uv: d.vec2f, properties: d.vec4f },
    })((input) => {
      "use gpu";
      const v = vertexAlgorithm(
        input.index,
        input.instance,
        input.billboardData,
        input.living.x,
        bindings.$.axes.right.xyz,
        bindings.$.axes.up.xyz,
      );
      return {
        position: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(v.world, 1)),
        world: v.world,
        uv: v.uv,
        properties: v.properties,
      };
    });
    const shade = environment.shade;
    const fragment = tgpu.fragmentFn({
      in: { world: d.vec3f, uv: d.vec2f, properties: d.vec4f },
      out: d.vec4f,
    })((v) => {
      "use gpu";
      const s = surfaceAlgorithm(
        v.uv,
        v.properties,
        bindings.$.albedo,
        bindings.$.normal,
        bindings.$.orm,
        bindings.$.linear,
      );
      return shade(
        s.base,
        d.vec3f(0),
        s.roughness,
        0,
        s.metal,
        s.ao,
        s.normal,
        v.world,
        1,
        typegpuCameraLayout.$.cam.eye,
      );
    });
    const pipeline = root
      .createRenderPipeline({
        vertex,
        fragment,
        attribs: instanceLayout.attrib,
        targets: { format: "rgba16float" },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: {
          format: GPU_DEPTH_FORMAT,
          depthWriteEnabled: true,
          depthCompare: "greater-equal",
        },
        multisample: { count: samples },
      })
      .with(group)
      .with(environment.group);
    await Promise.all([pipeline.initAsync(), closeScopes()]);
    return {
      update(source: readonly CrowdInstance[], view: ImpostorView) {
        assertLive();
        const packed = packImpostors(placement, source, view);
        count = source.length;
        if (count > capacity) {
          instances.destroy();
          capacity = Math.max(count, capacity * 2);
          instances = root.createBuffer(instanceLayout.schemaForCount(capacity)).$usage("vertex");
          owned.push(instances);
        }
        if (count) instances.write(packed.buffer);
        axes.write({ right: d.vec4f(...view.right, 0), up: d.vec4f(...view.up, 0) });
        return packed;
      },
      draw(pass: TgpuRenderCommands, camera: TgpuBindGroup) {
        assertLive();
        if (count) pipeline.with(camera).with(instanceLayout, instances).with(pass).draw(6, count);
      },
      stats: () => ({
        instances: count,
        draws: count ? 1 : 0,
        clipInvariant: false,
        castShadow: false,
        receiveShadow: false,
        atlasSource: "prepared full mip chain",
      }),
      dispose,
    };
  } catch (error) {
    try {
      await closeScopes();
    } finally {
      dispose();
    }
    throw error;
  }
}
