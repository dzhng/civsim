import { battleWorldDepth } from "../worldDepth";
import { tgpu, d, std, type TgpuRenderCommands, type TgpuBindGroup } from "typegpu";
import { buildStandardMesh } from "../../../game-renderer/src/models/shared/standardAsset";
import {
  BATTLE_STANDARD_TIER,
  BattleStandardRecords,
  battleStandardCapacity,
  type BattleStandardInstance,
} from "../../../game-renderer/src/models/shared/battleStandardData";
import { beginGpuAdmission } from "../gpuAdmission";
import { standardFunctions } from "../shaders/standards";
import { linearAlbedo } from "../shaders/soldierFactionTyped";
import { typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
const Vertex = d.struct({ world: d.vec3f, normal: d.vec3f }),
  Surface = d.struct({ albedo: d.vec3f, emissive: d.vec3f, roughness: d.f32, metalness: d.f32 });
const vertexAlgorithm = tgpu
  .fn(
    [d.vec3f, d.vec3f, d.vec4f, d.vec4f, d.vec4f, d.f32],
    Vertex,
  )(standardFunctions.vertex)
  .$uses({ StandardVertex: Vertex });
const surfaceAlgorithm = tgpu
  .fn(
    [d.f32, d.f32, d.vec3f],
    Surface,
  )(standardFunctions.surface)
  .$uses({ StandardSurface: Surface, standardLinear: linearAlbedo });
const vertexLayout = tgpu.vertexLayout(
    d.disarrayOf(d.unstruct({ local: d.vec3f, normal: d.vec3f, uvwm: d.vec4f })),
  ),
  instanceLayout = tgpu.vertexLayout(
    d.disarrayOf(d.unstruct({ pose: d.vec4f, details: d.vec4f, field: d.vec3f })),
    "instance",
  );
const State = d.struct({ view: d.mat4x4f, time: d.vec4f });
const layout = tgpu
  .bindGroupLayout({ state: { uniform: State, visibility: ["vertex", "fragment"] } })
  .$idx(1);
const worldNormal = tgpu.fn(
  [d.mat4x4f, d.vec3f],
  d.vec3f,
)(
  `(m:mat4x4f,n:vec3f)->vec3f {return normalize(transpose(mat3x3f(m[0].xyz,m[1].xyz,m[2].xyz))*normalize(n));}`,
);
const varyings = {
  world: d.vec3f,
  viewNormal: d.vec3f,
  geometryNormal: d.vec3f,
  field: d.vec3f,
  materialSelected: d.vec2f,
};
export async function createTypegpuStandards(
  device: GPUDevice,
  environment: TypegpuEnvironment,
  samples: 1 | 4 = 1,
) {
  const root = tgpu.initFromDevice({ device }),
    owned = new Set<{ destroy(): void }>(),
    records = new BattleStandardRecords(),
    mesh = buildStandardMesh(BATTLE_STANDARD_TIER).opaque;
  const own = <T extends { destroy(): void }>(b: T) => {
    owned.add(b);
    return b;
  };
  let anchors: Pick<BattleStandardInstance, "unitId" | "x" | "y" | "z">[] = [];
  let uploading = false;
  let disposed = false,
    capacity = 32,
    count = 0,
    selected = 0,
    visible = true;
  const check = () => {
      if (disposed) throw Error("TypeGPU standards disposed");
    },
    dispose = () => {
      if (disposed) return;
      disposed = true;
      anchors = [];
      count = selected = 0;
      for (const b of owned) b.destroy();
      root.destroy();
    };
  const finish = beginGpuAdmission(device);
  try {
    const vertices = own(
      root.createBuffer(vertexLayout.schemaForCount(mesh.vertices.length / 10)).$usage("vertex"),
    );
    vertices.write(mesh.vertices.slice().buffer);
    const indexData = new Uint16Array(mesh.indices.length + (mesh.indices.length % 2));
    indexData.set(mesh.indices);
    const indices = own(root.createBuffer(d.disarrayOf(d.u16, indexData.length)).$usage("index"));
    indices.write(indexData.buffer);
    let instances = own(
      root.createBuffer(instanceLayout.schemaForCount(capacity)).$usage("vertex"),
    );
    const state = own(root.createBuffer(State).$usage("uniform")),
      group = root.createBindGroup(layout, { state });
    const vertex = tgpu.vertexFn({
      in: {
        local: d.vec3f,
        normal: d.vec3f,
        uvwm: d.vec4f,
        pose: d.vec4f,
        details: d.vec4f,
        field: d.vec3f,
      },
      out: { position: d.builtin.position, ...varyings },
    })((v) => {
      "use gpu";
      const p = vertexAlgorithm(
        v.local,
        v.normal,
        v.uvwm,
        v.pose,
        v.details,
        layout.$.state.time.x,
      );
      return {
        position: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(p.world, 1)),
        world: p.world,
        viewNormal: std.normalize(std.mul(layout.$.state.view, d.vec4f(p.normal, 0)).xyz),
        geometryNormal: std.normalize(std.mul(layout.$.state.view, d.vec4f(v.normal, 0)).xyz),
        field: v.field,
        materialSelected: d.vec2f(v.uvwm.w, v.details.w),
      };
    });
    const shade = environment.shade,
      geometryRoughness = environment.geometryRoughnessFromView;
    const fragment = tgpu.fragmentFn({ in: varyings, out: d.vec4f })((v) => {
      "use gpu";
      const normal = worldNormal(layout.$.state.view, v.viewNormal);
      const s = surfaceAlgorithm(v.materialSelected.x, v.materialSelected.y, v.field);
      return shade(
        s.albedo,
        s.emissive,
        s.roughness,
        geometryRoughness(v.geometryNormal),
        s.metalness,
        1,
        normal,
        v.world,
        1,
        typegpuCameraLayout.$.cam.eye,
      );
    });
    const pipeline = root
      .createRenderPipeline({
        vertex,
        fragment,
        attribs: { ...vertexLayout.attrib, ...instanceLayout.attrib },
        targets: { format: "rgba16float" },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: battleWorldDepth("read-write"),
        multisample: { count: samples },
      })
      .with(group)
      .with(environment.group)
      .with(vertexLayout, vertices)
      .withIndexBuffer(indices);
    // Typed buffers/groups are lazy: force owned allocations while admission is open.
    root.unwrap(instances);
    root.unwrap(state);
    root.unwrap(group);
    await pipeline.initAsync();
    await finish();
    return {
      async upload(input: readonly BattleStandardInstance[]) {
        check();
        if (uploading) throw Error("Standards upload already in flight");
        uploading = true;
        try {
          const nextCapacity = battleStandardCapacity(input.length, capacity);
          if (nextCapacity * 44 > device.limits.maxBufferSize)
            throw Error("Standards buffer limit");
          const data = records.write(input);
          // Read the packed float32 positions sent to the instance buffer. Stage
          // them before admission so caller mutation cannot relabel this upload.
          const nextAnchors = input.map(({ unitId }, i) => ({
            unitId,
            x: data[i * 11],
            y: data[i * 11 + 1],
            z: data[i * 11 + 2],
          }));
          if (nextCapacity > capacity) {
            const admit = beginGpuAdmission(device);
            let next: typeof instances | undefined;
            try {
              next = own(
                root.createBuffer(instanceLayout.schemaForCount(nextCapacity)).$usage("vertex"),
              );
              if (data.length) next.write(data.slice().buffer);
              await admit();
              check();
            } catch (error) {
              try {
                await admit();
              } finally {
                if (next) {
                  next.destroy();
                  owned.delete(next);
                }
              }
              throw error;
            }
            instances.destroy();
            owned.delete(instances);
            instances = next;
            capacity = nextCapacity;
          } else if (data.length) instances.write(data.slice().buffer);
          anchors = nextAnchors;
          count = records.count;
          selected = records.selected;
        } finally {
          uploading = false;
        }
      },
      setView(view: ArrayLike<number>, time: number) {
        check();
        if (view.length !== 16) throw Error("Standards require a view matrix");
        state.write({ view: Array.from(view), time: d.vec4f(time, 0, 0, 0) });
      },
      setVisible(value: boolean) {
        visible = value;
      },
      draw(pass: TgpuRenderCommands, camera: TgpuBindGroup) {
        check();
        if (visible && count)
          pipeline
            .with(camera)
            .with(instanceLayout, instances)
            .with(pass)
            .drawIndexed(mesh.indexCount, count);
      },
      stats: () => ({
        count,
        selected,
        capacity,
        pipelines: 1,
        anchors: anchors.map((anchor) => ({ ...anchor })),
      }),
      dispose,
    };
  } catch (error) {
    try {
      await finish();
    } finally {
      dispose();
    }
    throw error;
  }
}
