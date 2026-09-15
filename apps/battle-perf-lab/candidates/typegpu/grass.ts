import {
  tgpu,
  d,
  std,
  type TgpuCommandEncoder,
  type TgpuRenderCommands,
  type TgpuBindGroup,
} from "typegpu";
import { beginGpuAdmission } from "../../src/gpuAdmission";
import { grassUniformData, type GrassFrame, type GrassGeometry } from "../../src/grassData";
import {
  GrassRecord,
  GrassParams,
  grassTier,
  grassVertex,
  grassLinear,
  grassEmissive,
} from "./grassFunctions";
import { typegpuCameraLayout } from "./camera";
import type { TypegpuEnvironment } from "./environment";
const Command = d.struct({
  indexCount: d.u32,
  instanceCount: d.atomic(d.u32),
  firstIndex: d.u32,
  baseVertex: d.i32,
  firstInstance: d.u32,
});
const routing = tgpu.bindGroupLayout({
  records: { storage: d.arrayOf(GrassRecord) },
  params: { uniform: GrassParams },
  commands: { storage: d.arrayOf(Command, 3), access: "mutable" },
  nearList: { storage: d.arrayOf(d.u32), access: "mutable" },
  midList: { storage: d.arrayOf(d.u32), access: "mutable" },
  farList: { storage: d.arrayOf(d.u32), access: "mutable" },
  active: { uniform: d.vec4u },
});
const recordsLayout = tgpu
  .bindGroupLayout({
    records: { storage: d.arrayOf(GrassRecord), visibility: ["vertex"] },
    visible: { storage: d.arrayOf(d.u32), visibility: ["vertex"] },
  })
  .$idx(1);
const paramsLayout = tgpu
  .bindGroupLayout({ grass: { uniform: GrassParams, visibility: ["vertex", "fragment"] } })
  .$idx(2);
const geometry = tgpu.vertexLayout(d.disarrayOf(d.vec3f));
const fragmentIn = { world: d.vec3f, normal: d.vec3f, albedo: d.vec3f, weights: d.vec2f };
const vertex = tgpu.vertexFn({
  in: { local: d.vec3f, instance: d.builtin.instanceIndex },
  out: {
    // 0.12.5 exposes invariant(), but vertexFn omits its decorated builtin from the input union.
    position: d.invariant(d.builtin.position) as d.Decorated<d.Vec4f> as typeof d.builtin.position,
    ...fragmentIn,
  },
})((input) => {
  "use gpu";
  const v = grassVertex(
    recordsLayout.$.records[recordsLayout.$.visible[input.instance]],
    input.local,
    paramsLayout.$.grass,
    typegpuCameraLayout.$.cam.eye,
    paramsLayout.$.grass.view,
  );
  return {
    position: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(v.world, 1)),
    world: v.world,
    normal: v.normal,
    albedo: v.albedo,
    weights: v.lightWeights,
  };
});
function bytes(v: ArrayBufferView): ArrayBuffer {
  if (v.buffer instanceof ArrayBuffer && v.byteOffset === 0 && v.byteLength === v.buffer.byteLength)
    return v.buffer;
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice().buffer;
}
/** TypeGPU owns every allocation, pipeline and command; camera/environment/encoder are borrowed. */
export async function createTypegpuGrass(
  device: GPUDevice,
  environment: TypegpuEnvironment,
  tiers: readonly GrassGeometry[],
  sampleCount: 1 | 4 = 1,
) {
  if (tiers.length !== 3) throw Error("Grass requires all three tiers");
  const root = tgpu.initFromDevice({ device }),
    owned = new Set<{ destroy(): void }>();
  const own = <T extends { destroy(): void }>(r: T) => {
    owned.add(r);
    return r;
  };
  let disposed = false,
    count = 0,
    capacity = 1;
  const check = () => {
    if (disposed) throw Error("TypeGPU grass disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const b of owned) b.destroy();
    root.destroy();
  };
  const admission = beginGpuAdmission(device);
  try {
    const params = own(root.createBuffer(GrassParams).$usage("uniform"));
    const active = own(root.createBuffer(d.vec4u).$usage("uniform"));
    active.write(d.vec4u(0));
    const commands = own(root.createBuffer(d.arrayOf(Command, 3)).$usage("storage", "indirect"));
    const paramsGroup = root.createBindGroup(paramsLayout, { grass: params });
    const allocate = (n: number) => {
      const added: { destroy(): void }[] = [];
      try {
        const records = own(root.createBuffer(d.arrayOf(GrassRecord, n)).$usage("storage"));
        added.push(records);
        const visible = Array.from({ length: 3 }, () => {
          const b = own(root.createBuffer(d.arrayOf(d.u32, n)).$usage("storage"));
          added.push(b);
          return b;
        });
        return {
          records,
          visible,
          added,
          groups: visible.map((v) => root.createBindGroup(recordsLayout, { records, visible: v })),
          routeGroup: root.createBindGroup(routing, {
            records,
            params,
            commands,
            nearList: visible[0],
            midList: visible[1],
            farList: visible[2],
            active,
          }),
        };
      } catch (error) {
        for (const b of added) {
          b.destroy();
          owned.delete(b);
        }
        throw error;
      }
    };
    let buffers = allocate(1);
    const reset = tgpu
      .computeFn({ workgroupSize: [1] })(
        `{let counts=array<u32,3>(${tiers.map((t) => t.indices.length + "u").join(",")});for(var i=0u;i<3u;i++){r.commands[i].indexCount=counts[i];atomicStore(&r.commands[i].instanceCount,0u);r.commands[i].firstIndex=0u;r.commands[i].baseVertex=0;r.commands[i].firstInstance=0u;}}`,
      )
      .$uses({ r: routing.$ });
    const route = tgpu
      .computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })(
        `{if(in.id.x>=r.active.x){return;}let tier=grassTier(r.records[in.id.x],r.params);if(tier<0){return;}let slot=atomicAdd(&r.commands[u32(tier)].instanceCount,1u);if(tier==0){r.nearList[slot]=in.id.x;}else if(tier==1){r.midList[slot]=in.id.x;}else{r.farList[slot]=in.id.x;}}`,
      )
      .$uses({ r: routing.$, grassTier });
    const resetPipeline = root.createComputePipeline({ compute: reset }),
      routePipeline = root.createComputePipeline({ compute: route });
    const shade = environment.shade;
    const fragment = tgpu.fragmentFn({ in: fragmentIn, out: d.vec4f })((v) => {
      "use gpu";
      const normal = std.normalize(v.normal);
      return shade(
        grassLinear(v.albedo),
        grassEmissive(
          normal,
          v.world,
          v.weights,
          paramsLayout.$.grass,
          typegpuCameraLayout.$.cam.eye,
        ),
        0.96,
        0,
        0,
        1,
        normal,
        v.world,
        1,
        typegpuCameraLayout.$.cam.eye,
      );
    });
    const depth = tgpu.fragmentFn({ in: fragmentIn, out: d.vec4f })(() => {
      "use gpu";
      return d.vec4f(0, 0, 0, 1);
    });
    const pipeline = (fragmentShader: typeof fragment, writeMask: number) =>
      root
        .createRenderPipeline({
          vertex,
          fragment: fragmentShader,
          attribs: { local: geometry.attrib },
          targets: { format: "rgba16float", writeMask },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: {
            format: "depth32float",
            depthWriteEnabled: true,
            depthCompare: "greater-equal",
          },
          multisample: { count: sampleCount },
        })
        .with(paramsGroup)
        .with(environment.group);
    const beauty = pipeline(fragment, GPUColorWrite.ALL),
      prepass = pipeline(depth, 0);
    const vertices = tiers.map((t) => {
      const b = own(
        root.createBuffer(geometry.schemaForCount(t.positions.length / 3)).$usage("vertex"),
      );
      b.write(bytes(t.positions));
      return b;
    });
    const indices = tiers.map((t) => {
      const b = own(root.createBuffer(d.disarrayOf(d.u16, t.indices.length)).$usage("index"));
      b.write(bytes(t.indices));
      return b;
    });
    await Promise.all([
      resetPipeline.initAsync(),
      routePipeline.initAsync(),
      beauty.initAsync(),
      prepass.initAsync(),
    ]);
    await admission();
    return {
      async updateRecords(next: Float32Array) {
        check();
        if (next.length % 16) throw Error("Grass expects complete records");
        if (
          next.byteLength > device.limits.maxStorageBufferBindingSize ||
          next.byteLength > device.limits.maxBufferSize
        )
          throw Error("Grass storage limit");
        const n = next.length / 16;
        if (n > capacity) {
          const admit = beginGpuAdmission(device);
          let staged: ReturnType<typeof allocate> | undefined;
          try {
            staged = allocate(n);
            staged.records.write(bytes(next));
            await admit();
            check();
          } catch (error) {
            try {
              await admit();
            } finally {
              if (staged)
                for (const b of staged.added) {
                  b.destroy();
                  owned.delete(b);
                }
            }
            throw error;
          }
          for (const b of buffers.added) {
            b.destroy();
            owned.delete(b);
          }
          buffers = staged;
          capacity = n;
        } else if (n) buffers.records.write(bytes(next));
        count = n;
        active.write(d.vec4u(n, 0, 0, 0));
      },
      update(frame: GrassFrame) {
        check();
        params.write(grassUniformData(frame).buffer);
      },
      route(encoder: TgpuCommandEncoder) {
        check();
        const pass = encoder.beginComputePass();
        resetPipeline.with(buffers.routeGroup).with(pass).dispatchWorkgroups(1);
        if (count)
          routePipeline
            .with(buffers.routeGroup)
            .with(pass)
            .dispatchWorkgroups(Math.ceil(count / 64));
        pass.end();
      },
      draw(
        pass: TgpuRenderCommands,
        camera: TgpuBindGroup,
        depthPrepass = false,
        farVisible = true,
        stage: "combined" | "depth" | "beauty" = "combined",
        onlyTier?: number,
      ) {
        check();
        const render = (pipeline: typeof beauty, tier: number) =>
          pipeline
            .with(camera)
            .with(buffers.groups[tier])
            .with(geometry, vertices[tier])
            .withIndexBuffer(indices[tier])
            .with(pass)
            .drawIndexedIndirect(commands, tier * 20);
        if (depthPrepass && stage !== "beauty")
          for (let i = 0; i < 2; i++)
            if (onlyTier === undefined || onlyTier === i) render(prepass, i);
        if (stage !== "depth")
          for (let i = 0; i < (farVisible ? 3 : 2); i++)
            if (onlyTier === undefined || onlyTier === i) render(beauty, i);
      },
      stats: () => ({ recordCount: count, capacity, pipelineBuilds: 4 }),
      readRouting: async () => ({
        commands: await commands.read(),
        visible: await Promise.all(buffers.visible.map((b) => b.read())),
      }),
      dispose,
    };
  } catch (error) {
    try {
      await admission();
    } finally {
      dispose();
    }
    throw error;
  }
}
