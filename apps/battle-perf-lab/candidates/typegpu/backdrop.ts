import { tgpu, d, std, type TgpuRenderPass } from "typegpu";
import { Camera, typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
import { terrainHash, terrainNoise, terrainRidge, terrainLinear } from "./terrainFunctions";
import { terrainMaterialFunctions } from "../../../../packages/battle-renderer/src/shaders/terrainMaterial";
import {
  backdropSurfaceWgsl,
  quadGroundHeightWgsl,
  type BackdropKind,
} from "../../../../packages/battle-renderer/src/shaders/backdrop";
import { BACKDROP_INDICES, backdropVertices, type BackdropRect } from "../../../../packages/battle-renderer/src/backdropData";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
const vertices = tgpu.vertexLayout(d.disarrayOf(d.vec3f));
const Surface = d.struct({ albedo: d.vec3f, normal: d.vec3f });
const turfCanopy = tgpu.fn([d.f32, d.f32, d.f32], d.vec3f)(terrainMaterialFunctions({}).turfCanopy);
const quadGroundHeight = tgpu
  .fn(
    [d.vec2f],
    d.f32,
  )(quadGroundHeightWgsl)
  .$uses({ terrainNoise, terrainRidge });
/** Borrowed camera/environment; depth-disabled opaque background band, not a shadow receiver. */
export async function createTypegpuBackdrop(
  device: GPUDevice,
  cameraBuffer: GPUBuffer,
  environment: TypegpuEnvironment,
  samples: 1 | 4,
) {
  const root = tgpu.initFromDevice({ device }),
    owned: { destroy(): void }[] = [];
  let disposed = false;
  const own = <T extends { destroy(): void }>(r: T) => {
    owned.push(r);
    return r;
  };
  const check = () => {
    if (disposed) throw Error("Backdrop disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const r of owned) r.destroy();
    root.destroy();
  };
  const finish = beginGpuAdmission(device);
  try {
    const camera = own(root.createBuffer(Camera, cameraBuffer).$usage("uniform"));
    const cameraGroup = root.createBindGroup(typegpuCameraLayout, { cam: camera });
    const backdrop = own(root.createBuffer(vertices.schemaForCount(4)).$usage("vertex"));
    const terrain = own(root.createBuffer(vertices.schemaForCount(4)).$usage("vertex"));
    const indices = own(
      root.createBuffer(d.arrayOf(d.u32, 6), Uint32Array.from(BACKDROP_INDICES)).$usage("index"),
    );
    const shade = environment.shade;
    const pipelines = (["backdrop", "default", "wide-detail"] as const).map((kind) => {
      const surface = tgpu
        .fn(
          [d.vec2f, d.f32],
          Surface,
        )(
          `(world:vec2f,distance:f32)->Surface{${backdropSurfaceWgsl(kind)} return Surface(albedo,normal);}`,
        )
        .$uses({
          Surface,
          terrainHash,
          terrainNoise,
          terrainRidge,
          terrainLinear,
          turfCanopy,
          quadGroundHeight,
        });
      const roughness = kind === "backdrop" ? 0.98 : 0.96;
      return root.createRenderPipeline({
        attribs: { p: vertices.attrib },
        vertex: tgpu.vertexFn({
          in: { p: d.vec3f },
          out: { clip: d.builtin.position, world: d.vec3f, distance: d.f32 },
        })((v) => {
          "use gpu";
          return {
            clip: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(v.p, 1)),
            world: v.p,
            distance: std.length(std.sub(v.p.xy, typegpuCameraLayout.$.cam.focus)),
          };
        }),
        fragment: tgpu.fragmentFn({
          in: { clip: d.builtin.position, world: d.vec3f, distance: d.f32 },
          out: d.vec4f,
        })((v) => {
          "use gpu";
          const s = surface(v.world.xy, v.distance);
          return shade(
            s.albedo,
            d.vec3f(0),
            roughness,
            0,
            0,
            1,
            s.normal,
            v.world,
            1,
            typegpuCameraLayout.$.cam.eye,
          );
        }),
        targets: { format: "rgba16float" },
        primitive: { cullMode: "back" },
        depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
        multisample: { count: samples },
      });
    });
    for (const r of [camera, backdrop, terrain, indices]) root.unwrap(r);
    root.unwrap(cameraGroup);
    root.unwrap(environment.group);
    const compilation = Promise.all(pipelines.map((p) => p.initAsync()));
    await Promise.all([finish(), compilation]);
    let style: "default" | "wide-detail" = "default";
    return {
      setRects(terrainRect: BackdropRect, backdropRect: BackdropRect) {
        check();
        terrain.write(backdropVertices(terrainRect).buffer);
        backdrop.write(backdropVertices(backdropRect).buffer);
      },
      setStyle(value: "default" | "wide-detail") {
        check();
        style = value;
      },
      draw(pass: TgpuRenderPass, only?: BackdropKind) {
        check();
        for (const kind of only ? [only] : (["backdrop", style] as const)) {
          const i = kind === "backdrop" ? 0 : kind === "default" ? 1 : 2;
          pipelines[i]
            .with(cameraGroup)
            .with(environment.group)
            .with(vertices, kind === "backdrop" ? backdrop : terrain)
            .withIndexBuffer(indices)
            .with(pass)
            .drawIndexed(6);
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
