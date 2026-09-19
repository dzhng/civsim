import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
import { tgpu, d, type TgpuRenderPass, type TgpuBindGroup } from "typegpu";
import {
  BATTLE_SCENERY_KINDS,
  packBattleScenery,
} from "../../../../packages/game-renderer/src/battle/sceneryData";
import { SCENERY_PROP_MODELS } from "../../../../packages/game-renderer/src/models/shared/sceneryPropRegistry";
import { buildLeafAtlas } from "../../../../packages/game-renderer/src/models/shared/leafAtlas";
import type { CampaignSceneryInstance } from "../../../../packages/game-renderer/src/campaign/sceneryPass";
import { sceneryVertexBodyWgsl, sceneryLeafBodyWgsl } from "../../../../packages/battle-renderer/src/shaders/scenery";
import { createTypegpuImageTexture } from "./imageTexture";
import { typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
const leafLayout = tgpu
  .bindGroupLayout({ leaf: { texture: d.texture2d() }, leafSampler: { sampler: "filtering" } })
  .$idx(1);
const meshLayout = tgpu.vertexLayout(
  d.disarrayOf(d.unstruct({ p: d.vec3f, n: d.vec3f, color: d.vec4f })),
);
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
        in: { p: d.vec3f, n: d.vec3f, color: d.vec4f, uv: d.vec2f, pose: d.vec4f, style: d.vec4f },
        out: varying,
      })((v) => {
        "use gpu";
        const r = algorithm(v.p, v.n, v.color, v.uv, v.pose, v.style);
        return {
          clip: r.clip,
          world: r.world,
          normal: r.normal,
          color: r.color,
          uv: r.uv,
          shade: r.shade,
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
          geometryNormalView: v.geometryNormalView,
        }),
      );
    });
    const casterAlgorithm = tgpu.fn(
      [d.f32],
      d.vec4f,
    )("(alpha:f32)->vec4f{if(alpha<=0.5){discard;}return vec4f(0);}");
    const state = {
      attribs: {
        ...meshLayout.attrib,
        uv: uvLayout.attrib,
        pose: poseLayout.attrib,
        style: styleLayout.attrib,
      },
      primitive: { cullMode: "none" as const },
      depthStencil: {
        format: "depth32float" as const,
        depthWriteEnabled: true,
        depthCompare: "greater-equal" as const,
      },
    };
    const beauty = root.createRenderPipeline({
      ...state,
      vertex: vertexFor(environment.layout),
      fragment,
      targets: { format: "rgba16float" },
      multisample: { count: samples },
    });
    // Pinned TypeGPU cannot emit an empty fragment output. Forward rasterized depth
    // through its public depth builtin while retaining source vertex-alpha discard.
    const depthFragment = tgpu.fragmentFn({ in: varying, out: { depth: d.builtin.fragDepth } })((
      v,
    ) => {
      "use gpu";
      casterAlgorithm(v.color.a);
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
      upload(instances: readonly CampaignSceneryInstance[]): Promise<void>;
      draw(pass: TgpuRenderPass, cam: TgpuBindGroup, audience: "main" | "shadow"): void;
      readonly count: number;
    }[] = [];
    for (const kind of BATTLE_SCENERY_KINDS) {
      const model = SCENERY_PROP_MODELS[kind].build().opaque;
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
        root.createBuffer(d.arrayOf(d.u32, model.indices.length)).$usage("index"),
      );
      indices.write(Uint32Array.from(model.indices).buffer);
      let capacity = 1,
        count = 0,
        pose = root.createBuffer(poseLayout.schemaForCount(1)).$usage("vertex"),
        style = root.createBuffer(styleLayout.schemaForCount(1)).$usage("vertex");
      releases.push(() => {
        pose.destroy();
        style.destroy();
      });
      buckets.push({
        async upload(instances: readonly CampaignSceneryInstance[]) {
          const data = packBattleScenery(kind, instances);
          if (data.count > capacity) {
            const n = 2 ** Math.ceil(Math.log2(data.count));
            const finish = beginGpuAdmission(device);
            const nextPose = root.createBuffer(poseLayout.schemaForCount(n)).$usage("vertex");
            const nextStyle = root.createBuffer(styleLayout.schemaForCount(n)).$usage("vertex");
            pending.add(nextPose);
            pending.add(nextStyle);
            try {
              root.unwrap(nextPose);
              root.unwrap(nextStyle);
              await finish();
              if (disposed) throw Error("TypeGPU scenery disposed during growth");
              pose.destroy();
              style.destroy();
              pose = nextPose;
              style = nextStyle;
              capacity = n;
              pending.delete(nextPose);
              pending.delete(nextStyle);
            } catch (error) {
              nextPose.destroy();
              nextStyle.destroy();
              pending.delete(nextPose);
              pending.delete(nextStyle);
              await finish();
              throw error;
            }
          }
          count = data.count;
          if (count) {
            pose.write(data.pose.buffer);
            style.write(data.style.buffer);
          }
        },
        draw(pass: TgpuRenderPass, cam: TgpuBindGroup, audience: "main" | "shadow") {
          if (!count) return;
          let pipe =
            audience === "main"
              ? beauty.with(leafGroup).with(environment.group)
              : shadow.with(environment.casterGroup);
          pipe
            .with(cam)
            .with(meshLayout, vertices)
            .with(uvLayout, uvs)
            .with(poseLayout, pose)
            .with(styleLayout, style)
            .withIndexBuffer(indices)
            .with(pass)
            .drawIndexed(model.indices.length, count);
        },
        get count() {
          return count;
        },
      });
    }
    return {
      async upload(instances: readonly CampaignSceneryInstance[]) {
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
      stats: () => ({ scenery: buckets.reduce((n, b) => n + b.count, 0) }),
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}
