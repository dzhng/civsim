import {
  BATTLE_SCENERY_DETAIL,
  sceneryVariant,
  sceneryPixels,
  sceneryDetailActive,
  sceneryLeafFade,
  sceneryShapes,
  sceneryLeafIndices,
} from "../../../game-renderer/src/terrain/sceneryDetail";
import {
  TREE_VARIANTS,
  type TreeDetail,
} from "../../../game-renderer/src/models/shared/sceneryPropModels";
import type { ProjectionFootprint } from "../../../renderer-core/src/camera3d";
import { battleWorldDepth } from "../worldDepth";
import { beginGpuAdmission } from "../gpuAdmission";
import { tgpu, d, std, type TgpuRenderPass, type TgpuBindGroup } from "typegpu";
import { BATTLE_SCENERY_KINDS } from "../../../game-renderer/src/battle/sceneryData";
import { SCENERY_PROP_MODELS } from "../../../game-renderer/src/models/shared/sceneryPropRegistry";
import { buildLeafAtlas } from "../../../game-renderer/src/models/shared/leafAtlas";
import type { SceneryInstance } from "../../../game-renderer/src/terrain/scenery";
import { sceneryVertexBodyWgsl, sceneryLeafBodyWgsl } from "../shaders/scenery";
import { createTypegpuImageTexture } from "./imageTexture";
import { typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
const leafLayout = tgpu
  .bindGroupLayout({ leaf: { texture: d.texture2d() }, leafSampler: { sampler: "filtering" } })
  .$idx(1);
const meshLayout = tgpu.vertexLayout(
  d.disarrayOf(d.unstruct({ p: d.vec3f, n: d.vec3f, color: d.vec4f })),
);
const shapesLayout = tgpu.vertexLayout(
  d.disarrayOf(d.unstruct({ p1: d.vec3f, n1: d.vec3f, p2: d.vec3f, n2: d.vec3f })),
);
const shapeLayout = tgpu.vertexLayout(d.disarrayOf(d.f32), "instance");
const uvLayout = tgpu.vertexLayout(d.disarrayOf(d.vec2f));
const poseLayout = tgpu.vertexLayout(d.disarrayOf(d.vec4f), "instance"),
  styleLayout = tgpu.vertexLayout(d.disarrayOf(d.vec4f), "instance");
const V = d.struct({
  clip: d.vec4f,
  world: d.vec3f,
  normal: d.vec3f,
  color: d.vec4f,
  uv: d.vec2f,
  shade: d.f32,
  presence: d.f32,
  geometryNormalView: d.vec3f,
});
const varying = { ...V.propTypes, clip: d.builtin.position };
/** Typed geometry, mip preparation and beauty/caster pipelines; frame resources are borrowed. */
export async function createTypegpuScenery(
  device: GPUDevice,
  camera: TgpuBindGroup,
  environment: TypegpuEnvironment,
  samples: 1 | 4,
) {
  const root = tgpu.initFromDevice({ device });
  const releases: (() => void)[] = [];
  const pending = new Set<{ destroy(): void }>();
  let disposed = false;
  let finishGeometry: (() => Promise<void>) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const resource of pending) resource.destroy();
    pending.clear();
    for (const f of releases.reverse()) f();
    root.destroy();
  };
  const own = <T extends { destroy(): void }>(r: T) => {
    releases.push(() => r.destroy());
    return r;
  };
  try {
    const atlas = buildLeafAtlas();
    const leaf = await createTypegpuImageTexture(
      device,
      { width: atlas.width, height: atlas.height, data: atlas.rgba },
      { colorSpace: "linear", generateMipmaps: true },
    );
    releases.push(leaf.dispose);
    const leafSampler = root.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    const leafGroup = root.createBindGroup(leafLayout, {
      leaf: leaf.texture.createView(),
      leafSampler,
    });
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
    const vertexFor = (
      layout: TypegpuEnvironment["layout"] | TypegpuEnvironment["casterLayout"],
    ) => {
      const algorithm = tgpu
        .fn(
          [d.vec3f, d.vec3f, d.vec4f, d.vec2f, d.vec4f, d.vec4f],
          V,
        )(
          `(p:vec3f,n:vec3f,color:vec4f,uv:vec2f,pose:vec4f,style:vec4f)->V{${sceneryVertexBodyWgsl}}`,
        )
        .$uses({
          V,
          projectWorld,
          get environment() {
            return layout.$.data;
          },
        });
      return tgpu.vertexFn({
        in: {
          p: d.vec3f,
          n: d.vec3f,
          p1: d.vec3f,
          n1: d.vec3f,
          p2: d.vec3f,
          n2: d.vec3f,
          shape: d.f32,
          color: d.vec4f,
          uv: d.vec2f,
          pose: d.vec4f,
          style: d.vec4f,
        },
        out: varying,
      })((v) => {
        "use gpu";
        const p = std.select(std.select(v.p, v.p1, v.shape >= 0.5), v.p2, v.shape >= 1.5);
        const n = std.select(std.select(v.n, v.n1, v.shape >= 0.5), v.n2, v.shape >= 1.5);
        const r = algorithm(p, n, v.color, v.uv, v.pose, v.style);
        return {
          clip: r.clip,
          world: r.world,
          normal: r.normal,
          color: r.color,
          uv: r.uv,
          shade: r.shade,
          presence: r.presence,
          geometryNormalView: r.geometryNormalView,
        };
      });
    };
    const leafColor = tgpu
      .fn(
        [V],
        d.vec4f,
      )(`(v:V)->vec4f{${sceneryLeafBodyWgsl}}`)
      .$uses({
        V,
        get leaf() {
          return leafLayout.$.leaf;
        },
        get leafSampler() {
          return leafLayout.$.leafSampler;
        },
      });
    const shade = tgpu
      .fn(
        [V],
        d.vec4f,
      )(
        `(v:V)->vec4f{let color=leafColor(v);let lit=shadeWorldSurface(color.rgb,vec3f(0),0.9,geometryRoughnessFromView(v.geometryNormalView),0,1,normalize(v.normal),v.world,${environment.shadows ? "sampleSunShadow(v.world,normalize(v.normal),v.clip.xy)" : "1.0"},cam.eye);return vec4f(lit.rgb,1);}`,
      )
      .$uses({
        V,
        leafColor,
        shadeWorldSurface: environment.shade,
        geometryRoughnessFromView: environment.geometryRoughnessFromView,
        sampleSunShadow: environment.sampleSunShadow,
        get cam() {
          return typegpuCameraLayout.$.cam;
        },
      });
    const fragment = tgpu.fragmentFn({ in: varying, out: d.vec4f })((v) => {
      "use gpu";
      return shade(
        V({
          clip: v.clip,
          world: v.world,
          normal: v.normal,
          color: v.color,
          uv: v.uv,
          shade: v.shade,
          presence: v.presence,
          geometryNormalView: v.geometryNormalView,
        }),
      );
    });
    const state = {
      attribs: {
        ...meshLayout.attrib,
        ...shapesLayout.attrib,
        shape: shapeLayout.attrib,
        uv: uvLayout.attrib,
        pose: poseLayout.attrib,
        style: styleLayout.attrib,
      },
      primitive: { cullMode: "none" as const },
      depthStencil: battleWorldDepth("read-write"),
    };
    const beauty = root.createRenderPipeline({
      ...state,
      vertex: vertexFor(environment.layout),
      fragment,
      targets: { format: "rgba16float" },
      multisample: { count: samples },
    });
    // Pinned TypeGPU cannot emit an empty fragment output. Forward rasterized depth
    // through its public depth builtin after the same leaf cutout as the visible pass.
    const depthFragment = tgpu.fragmentFn({ in: varying, out: { depth: d.builtin.fragDepth } })((
      v,
    ) => {
      "use gpu";
      leafColor(
        V({
          clip: v.clip,
          world: v.world,
          normal: v.normal,
          color: v.color,
          uv: v.uv,
          shade: v.shade,
          presence: v.presence,
          geometryNormalView: v.geometryNormalView,
        }),
      );
      return { depth: v.clip.z };
    });
    const shadow = root.createRenderPipeline({
      ...state,
      vertex: vertexFor(environment.casterLayout),
      fragment: depthFragment,
      targets: {},
    });
    await Promise.all([beauty.initAsync(), shadow.initAsync()]);
    const buckets: {
      upload(instances: readonly SceneryInstance[]): Promise<void>;
      draw(pass: TgpuRenderPass, cam: TgpuBindGroup, audience: "main" | "shadow"): void;
      prepare(projection: ProjectionFootprint): void;
      readonly count: number;
      readonly detailed: boolean;
      readonly triangles: number;
    }[] = [];
    finishGeometry = beginGpuAdmission(device);
    for (const kind of BATTLE_SCENERY_KINDS) {
      const tree = SCENERY_PROP_MODELS[kind].family === "tree";
      for (const level of (tree ? ["canopy", "leaves"] : ["canopy"]) as TreeDetail[]) {
        const models = Array.from(
          { length: tree ? TREE_VARIANTS : 1 },
          (_, variant) => SCENERY_PROP_MODELS[kind].build(level, variant).opaque,
        );
        const model = models[0];
        const detailed = level === "leaves";
        const modelIndices = detailed ? sceneryLeafIndices(model) : model.indices;
        let modelHeight = 0;
        for (const candidate of models)
          for (let i = 2; i < candidate.vertices.length; i += 10)
            modelHeight = Math.max(modelHeight, candidate.vertices[i]);
        const shapes = own(
          root
            .createBuffer(shapesLayout.schemaForCount(model.vertices.length / 10))
            .$usage("vertex"),
        );
        shapes.write(sceneryShapes(models).buffer);
        const vertices = own(
          root.createBuffer(meshLayout.schemaForCount(model.vertices.length / 10)).$usage("vertex"),
        );
        vertices.write(model.vertices.slice().buffer);
        const uvs = own(
          root.createBuffer(uvLayout.schemaForCount(model.vertices.length / 10)).$usage("vertex"),
        );
        uvs.write(
          (model.uvs ?? new Float32Array((model.vertices.length / 10) * 2).fill(-1)).slice().buffer,
        );
        const indices = own(
          root.createBuffer(d.arrayOf(d.u32, modelIndices.length)).$usage("index"),
        );
        indices.write(Uint32Array.from(modelIndices).buffer);
        let capacity = 1,
          count = 0,
          pose = root.createBuffer(poseLayout.schemaForCount(1)).$usage("vertex"),
          style = root.createBuffer(styleLayout.schemaForCount(1)).$usage("vertex"),
          shape = root.createBuffer(shapeLayout.schemaForCount(1)).$usage("vertex");
        let list: readonly SceneryInstance[] = [],
          active: boolean[] = [];
        let poseData = new Float32Array(4),
          styleData = new Float32Array(4),
          shapeData = new Float32Array(1);
        const store = (data: Float32Array, index: number, value: number) => {
          const rounded = Math.fround(value),
            changed = data[index] !== rounded;
          data[index] = rounded;
          return changed;
        };
        const write = (projection?: ProjectionFootprint) => {
          let nextCount = 0,
            poseDirty = false,
            styleDirty = false,
            shapeDirty = false;
          for (let i = 0; i < list.length; i++) {
            const inst = list[i];
            let fade = 1;
            if (detailed) {
              const pixels = projection ? sceneryPixels(inst, modelHeight, projection) : 0;
              active[i] = sceneryDetailActive(pixels, active[i], BATTLE_SCENERY_DETAIL);
              fade = sceneryLeafFade(pixels, BATTLE_SCENERY_DETAIL);
              if (!active[i] || fade <= 0.5) continue;
            }
            const o = nextCount * 4;
            poseDirty = store(poseData, o, inst.x) || poseDirty;
            poseDirty = store(poseData, o + 1, inst.y) || poseDirty;
            poseDirty = store(poseData, o + 2, inst.size) || poseDirty;
            poseDirty = store(poseData, o + 3, inst.z ?? 0) || poseDirty;
            styleDirty = store(styleData, o, inst.shade ?? 0.5) || styleDirty;
            styleDirty = store(styleData, o + 1, inst.height ?? inst.size) || styleDirty;
            styleDirty = store(styleData, o + 2, inst.yaw ?? 0) || styleDirty;
            styleDirty = store(styleData, o + 3, fade) || styleDirty;
            shapeDirty = store(shapeData, nextCount, sceneryVariant(inst)) || shapeDirty;
            nextCount++;
          }
          if (nextCount) {
            if (poseDirty || count !== nextCount) pose.write(poseData.buffer);
            if (styleDirty || count !== nextCount) style.write(styleData.buffer);
            if (shapeDirty || count !== nextCount) shape.write(shapeData.buffer);
          }
          count = nextCount;
        };
        releases.push(() => {
          pose.destroy();
          style.destroy();
          shape.destroy();
        });
        // Camera preparation only updates admitted buffers, including first near entry.
        for (const resource of [vertices, uvs, indices, shapes, pose, style, shape])
          root.unwrap(resource);
        buckets.push({
          async upload(instances: readonly SceneryInstance[]) {
            list = instances.filter((instance) => instance.kind === kind);
            active = list.map(() => false);
            if (list.length > capacity) {
              const n = 2 ** Math.ceil(Math.log2(list.length));
              const finish = beginGpuAdmission(device);
              const nextPose = root.createBuffer(poseLayout.schemaForCount(n)).$usage("vertex");
              const nextStyle = root.createBuffer(styleLayout.schemaForCount(n)).$usage("vertex");
              const nextShape = root.createBuffer(shapeLayout.schemaForCount(n)).$usage("vertex");
              pending.add(nextShape);
              pending.add(nextPose);
              pending.add(nextStyle);
              try {
                root.unwrap(nextPose);
                root.unwrap(nextStyle);
                root.unwrap(nextShape);
                await finish();
                if (disposed) throw Error("TypeGPU scenery disposed during growth");
                pose.destroy();
                style.destroy();
                shape.destroy();
                pose = nextPose;
                style = nextStyle;
                shape = nextShape;
                poseData = new Float32Array(n * 4);
                styleData = new Float32Array(n * 4);
                shapeData = new Float32Array(n);
                capacity = n;
                pending.delete(nextPose);
                pending.delete(nextStyle);
                pending.delete(nextShape);
              } catch (error) {
                nextPose.destroy();
                nextStyle.destroy();
                nextShape.destroy();
                pending.delete(nextPose);
                pending.delete(nextStyle);
                pending.delete(nextShape);
                await finish();
                throw error;
              }
            }
            count = 0;
            write();
          },
          prepare(projection: ProjectionFootprint) {
            if (detailed) write(projection);
          },
          detailed,
          get triangles() {
            return (modelIndices.length / 3) * count;
          },
          draw(pass: TgpuRenderPass, cam: TgpuBindGroup, audience: "main" | "shadow") {
            if (!count) return;
            let pipe =
              audience === "main"
                ? beauty.with(leafGroup).with(environment.group)
                : shadow.with(leafGroup).with(environment.casterGroup);
            pipe
              .with(cam)
              .with(meshLayout, vertices)
              .with(uvLayout, uvs)
              .with(shapesLayout, shapes)
              .with(shapeLayout, shape)
              .with(poseLayout, pose)
              .with(styleLayout, style)
              .withIndexBuffer(indices)
              .with(pass)
              .drawIndexed(modelIndices.length, count);
          },
          get count() {
            return count;
          },
        });
      }
    }
    await finishGeometry();
    return {
      prepare(projection: ProjectionFootprint) {
        if (disposed) throw Error("TypeGPU scenery disposed");
        for (const b of buckets) b.prepare(projection);
      },
      async upload(instances: readonly SceneryInstance[]) {
        if (disposed) throw Error("TypeGPU scenery disposed");
        for (const b of buckets) await b.upload(instances);
      },
      draw(
        pass: TgpuRenderPass,
        cam: TgpuBindGroup = camera,
        audience: "main" | "shadow" = "main",
      ) {
        if (disposed) throw Error("TypeGPU scenery disposed");
        for (const b of buckets) b.draw(pass, cam, audience);
      },
      stats: () => ({
        scenery: buckets.reduce((n, b) => n + (b.detailed ? 0 : b.count), 0),
        sceneryDetailed: buckets.reduce((n, b) => n + (b.detailed ? b.count : 0), 0),
        sceneryDrawCalls: buckets.filter((b) => b.count > 0).length,
        sceneryTriangles: buckets.reduce((n, b) => n + b.triangles, 0),
      }),
      dispose,
    };
  } catch (e) {
    dispose();
    await finishGeometry?.();
    throw e;
  }
}
