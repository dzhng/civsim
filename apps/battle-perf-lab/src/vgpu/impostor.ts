import {
  impostorAtlasLayout,
  type ImpostorAtlasData,
} from "../../../../packages/soldier-assets/src/impostorAtlas";
import { draw, geometry, texture, sampler, type Gpu, type FramePass } from "vgpu";
import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import { packImpostors, type ImpostorView } from "../impostorData";
import { impostorShader } from "../shaders/impostor";
import type { VgpuEnvironment } from "./environment";

/** A vgpu Draw encoded into its caller's FramePass. All atlas/geometry resources are owned here. */
export async function createVgpuImpostors(
  gpu: Gpu,
  atlas: ImpostorAtlasData,
  environment: VgpuEnvironment,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  samples: 1 | 4 = 4,
) {
  const placement = impostorAtlasLayout(atlas);
  const owned: { destroy(): void }[] = [];
  let disposed = false,
    count = 0,
    capacity = 512,
    scopesOpen = false;
  const device = gpu.device.gpu;
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
    if (errors.length) throw new Error(`vgpu impostor admission: ${errors.join("; ")}`);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.destroy();
  };
  const assertLive = () => {
    if (disposed) throw new Error("vgpu impostors disposed");
  };
  try {
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("internal");
    device.pushErrorScope("validation");
    scopesOpen = true;
    const meshFor = (n: number) => {
      const mesh = geometry(gpu, {
        buffers: [
          {
            data: new Float32Array(n * 12),
            stride: 48,
            stepMode: "instance",
            attributes: { instance: "float32x4", billboardData: "float32x4", living: "float32x4" },
          },
        ],
        vertexCount: 6,
      });
      owned.push(mesh);
      return mesh;
    };
    let mesh = meshFor(capacity);
    const width = atlas.columns * atlas.tileSize,
      height = atlas.rows * atlas.tileSize,
      levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    const upload = (chain: readonly Uint8Array[], format: "rgba8unorm" | "rgba8unorm-srgb") => {
      if (chain.length !== levels) throw new Error("Impostor atlas requires complete mip chains");
      const t = texture(gpu, {
        kind: "2d",
        size: [width, height],
        format,
        mipLevelCount: levels,
        usage: ["texture_binding", "copy_dst"],
      });
      owned.push(t);
      chain.forEach((bytes, mipLevel) => {
        const w = Math.max(1, width >> mipLevel),
          h = Math.max(1, height >> mipLevel);
        if (bytes.length !== w * h * 4) throw new Error("Impostor mip dimensions mismatch");
        device.queue.writeTexture({ texture: t.gpu, mipLevel }, bytes, { bytesPerRow: w * 4 }, [
          w,
          h,
        ]);
      });
      return t;
    };
    const albedoAtlas = upload(atlas.albedo, "rgba8unorm-srgb"),
      normalAtlas = upload(atlas.normal, "rgba8unorm"),
      ormAtlas = upload(atlas.orm, "rgba8unorm");
    const billboard = gpu.device.createBuffer({ size: 32, usage: ["uniform", "copy_dst"] });
    owned.push(billboard);
    const atlasSampler = sampler(gpu, {
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    const shader = impostorShader(environment.shader, atlas.columns, atlas.rows);
    const makeDraw = () =>
      draw(gpu, {
        shader,
        geometry: mesh,
        cull: "none",
        depth: { write: true, compare: "greater-equal" },
        set: {
          cam: camera,
          billboard,
          albedoAtlas,
          normalAtlas,
          ormAtlas,
          atlasSampler,
          ...environment.bindings,
        },
      });
    let render = makeDraw();
    await closeScopes();
    await render.compile({ colors: ["rgba16float"], depth: "depth32float", sampleCount: samples });
    return {
      update(source: readonly CrowdInstance[], view: ImpostorView) {
        assertLive();
        const packed = packImpostors(placement, source, view);
        count = source.length;
        if (count > capacity) {
          mesh.destroy();
          capacity = Math.max(count, capacity * 2);
          mesh = meshFor(capacity);
          render = makeDraw();
        }
        if (count) mesh.write(packed);
        billboard.write(new Float32Array([...view.right, 0, ...view.up, 0]));
        return packed;
      },
      draw(pass: FramePass) {
        assertLive();
        if (count) pass.draw(render, { instances: count });
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
