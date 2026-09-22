import { waterField } from "./waterField";
import { battleWorldDepth } from "../worldDepth";
import { tgpu, d, type TgpuRenderPass, type TgpuBindGroup } from "typegpu";
import { prepareWaterSurfaces, type BattleWaterInput } from "../waterData";
import type { BattleWaterContent } from "../types";
import { waterShaderBodies } from "../shaders/water";
import { terrainWaterNoise, terrainLinear, fieldWaterResponse } from "./terrainFunctions";
import { beginGpuAdmission } from "../gpuAdmission";
import { typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
const WaterState = d.struct({ baseZ: d.f32, shoreX: d.f32, pad: d.vec2f });

// shore is lake distance in metres, or adjoining field coverage for an ocean join.
const VertexOut = d.struct({ clip: d.vec4f, position: d.vec3f, shore: d.f32 });
const waterLayout = tgpu.bindGroupLayout({ water: { uniform: WaterState } }).$idx(1);
const positions = tgpu.vertexLayout(d.disarrayOf(d.vec3f)),
  shores = tgpu.vertexLayout(d.disarrayOf(d.f32));
const varying = { ...VertexOut.propTypes, clip: d.builtin.position };
/** Public typed buffers, pipelines and draw commands. Immutable water geometry
 * is replaced by constructing another owner, not a hot-path capacity pool. */
export async function createTypegpuWater(
  device: GPUDevice,
  camera: TgpuBindGroup,
  environment: TypegpuEnvironment,
  inputs: readonly BattleWaterInput[],
  samples: 1 | 4,
) {
  const root = tgpu.initFromDevice({ device });
  const owned: { destroy(): void }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const resource of owned) resource.destroy();
    root.destroy();
  };
  const admit = beginGpuAdmission(device);
  try {
    const own = <T extends { destroy(): void }>(value: T) => {
      owned.push(value);
      return value;
    };
    const draws: {
      draw(pass: TgpuRenderPass): void;
      surface: BattleWaterContent["surfaces"][number];
    }[] = [];
    const projectWorld = tgpu
      .fn(
        [d.vec3f],
        d.vec4f,
      )("(world:vec3f)->vec4f{return cam.viewProj*vec4f(world,1);}")
      .$uses({
        get cam() {
          return typegpuCameraLayout.$.cam;
        },
      });
    const shadeWorldSurface = tgpu
      .fn(
        [d.vec3f, d.vec3f, d.f32, d.f32, d.f32, d.f32, d.vec3f, d.vec3f, d.f32],
        d.vec4f,
      )(
        "(base:vec3f,emissive:vec3f,roughness:f32,geom:f32,metal:f32,ao:f32,normal:vec3f,world:vec3f,shadow:f32)->vec4f{return shade(base,emissive,roughness,geom,metal,ao,normal,world,shadow,cam.eye);}",
      )
      .$uses({
        shade: environment.shade,
        get cam() {
          return typegpuCameraLayout.$.cam;
        },
      });
    const makePipeline = (lake: boolean) => {
      const body = waterShaderBodies(lake);
      const vertexBody = tgpu
        .fn(
          [d.vec3f, d.f32],
          VertexOut,
        )(`(p:vec3f,shore:f32)->VertexOut{${body.vertex}}`)
        .$uses({
          waterField,
          get cam() {
            return typegpuCameraLayout.$.cam;
          },
          get water() {
            return waterLayout.$.water;
          },
          VertexOut,
          projectWorld,
        });
      const fragmentBody = tgpu
        .fn(
          [VertexOut],
          d.vec4f,
        )(`(v:VertexOut)->vec4f{${body.fragment}}`)
        .$uses({
          waterField,
          get cam() {
            return typegpuCameraLayout.$.cam;
          },
          get water() {
            return waterLayout.$.water;
          },
          VertexOut,
          terrainWaterNoise,
          terrainLinear,
          fieldWaterResponse,
          shadeWorldSurface,
        });
      const vertex = tgpu.vertexFn({
        in: { p: d.vec3f, shore: d.f32 },
        out: {
          ...varying,
          // Public invariant() is supported; vertexFn's builtin type omits its decoration.
          clip: d.invariant(
            d.builtin.position,
          ) as d.Decorated<d.Vec4f> as typeof d.builtin.position,
        },
      })((v) => {
        "use gpu";
        const r = vertexBody(v.p, v.shore);
        return { clip: r.clip, position: r.position, shore: r.shore };
      });
      const fragment = tgpu.fragmentFn({ in: varying, out: d.vec4f })((v) => {
        "use gpu";
        return fragmentBody(VertexOut({ clip: v.clip, position: v.position, shore: v.shore }));
      });
      return root.createRenderPipeline({
        vertex,
        fragment,
        attribs: { p: positions.attrib, shore: shores.attrib },
        targets: { format: "rgba16float" },
        primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
        depthStencil: battleWorldDepth("read-write"),
        multisample: { count: samples },
      });
    };
    const pipelines = new Map<string, ReturnType<typeof makePipeline>>();
    for (const data of prepareWaterSurfaces(inputs)) {
      let pipeline = pipelines.get(data.kind);
      if (!pipeline) {
        pipeline = makePipeline(data.kind === "lake");
        await pipeline.initAsync();
        pipelines.set(data.kind, pipeline);
      }
      const p = own(
        root.createBuffer(positions.schemaForCount(data.positions.length / 3)).$usage("vertex"),
      );
      p.write(data.positions.slice().buffer);
      const shore = own(
        root.createBuffer(shores.schemaForCount(data.shoreDist.length)).$usage("vertex"),
      );
      shore.write(data.shoreDist.slice().buffer);
      const indices = own(root.createBuffer(d.arrayOf(d.u32, data.indices.length)).$usage("index"));
      indices.write(data.indices.slice().buffer);
      const state = own(
        root
          .createBuffer(WaterState, {
            baseZ: data.state[0],
            shoreX: data.state[1],
            pad: d.vec2f(0),
          })
          .$usage("uniform"),
      );
      const group = root.createBindGroup(waterLayout, { water: state });
      // TypeGPU buffers and groups are lazy; admission must include their real allocations.
      root.unwrap(state);
      root.unwrap(group);
      const configured = pipeline
        .with(camera)
        .with(environment.group)
        .with(group)
        .with(positions, p)
        .with(shores, shore)
        .withIndexBuffer(indices);
      draws.push({
        surface: {
          kind: data.kind,
          level: data.level,
          surfaceLevel: data.state[0],
          triangles: data.indices.length / 3,
        },
        draw(pass) {
          configured.with(pass).drawIndexed(data.indices.length);
        },
      });
    }
    await admit();
    return {
      draw(pass: TgpuRenderPass) {
        if (disposed) throw Error("TypeGPU water disposed");
        for (const draw of draws) draw.draw(pass);
      },
      stats() {
        return {
          draws: draws.length,
          triangles: draws.reduce((sum, draw) => sum + draw.surface.triangles, 0),
          surfaces: draws.map((draw) => ({ ...draw.surface })),
          ownedBuffers: disposed ? 0 : owned.length,
          disposed,
          depth: "read-write",
          blending: "opaque",
        };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    await admit();
    throw error;
  }
}
