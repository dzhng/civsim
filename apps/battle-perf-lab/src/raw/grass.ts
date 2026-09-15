import { WORLD_CAMERA_WGSL } from "../../../../packages/renderer-core/src/cameraWgsl";
import type { BladeFieldStats } from "../../../../packages/photoreal-renderer/src/battle/bladeFieldLayer";
import { grassTypesWGSL, grassRoutingWGSL, grassVertexWGSL } from "../shaders/grass";
import type { RawEnvironment } from "./environment";

export interface GrassGeometry {
  positions: Float32Array;
  indices: Uint16Array;
}
export interface GrassFrame {
  anchor: readonly [number, number];
  view: ArrayLike<number>;
  transition: BladeFieldStats["transition"];
  thinning: BladeFieldStats["thinning"];
  mask: BladeFieldStats["routeCullMask"];
  wedge: BladeFieldStats["routeCullWedge"];
  wind: {
    direction: readonly [number, number];
    speed: number;
    gustPhase: number;
    velocity: readonly [number, number];
    frequency: number;
    sharpness: number;
  };
  sun: readonly [number, number, number];
  rim: number;
  subsurface: number;
}
export function grassUniformData(s: GrassFrame): Float32Array<ArrayBuffer> {
  const p = s.transition,
    w = s.wind,
    m = s.mask,
    c = s.wedge;
  if (s.view.length !== 16) throw new Error("Grass requires camera view matrix");
  const values = new Float32Array(56);
  values.set([
    ...s.anchor,
    p.nearTierEndM,
    p.midTierEndM,
    p.farGrassStartM,
    p.farGrassEndM,
    p.farSoftWidthScale,
    p.edgeSinkStartM ?? Math.max(0, p.farGrassEndM - 0.001),
    p.nearCoverageWidthScale,
    p.lowerFarWidthScale,
    p.lowerFarWidthEndM,
    s.thinning.survivorAlbedoBlend,
    ...w.direction,
    w.speed,
    w.gustPhase,
    ...w.velocity,
    w.frequency,
    w.sharpness,
    ...s.sun,
    s.rim,
    s.subsurface,
    s.thinning.densityReferenceM,
    s.thinning.falloffPower,
    +s.thinning.enabled,
    ...m.center,
    m.radiusSq,
    +m.enabled,
    ...c.forward,
    ...c.side,
    c.halfWidthSlope,
    c.backMarginM,
    c.farMarginM,
    +c.enabled,
  ]);
  values.set(s.view, 40);
  return values;
}
/** Published records and exact source geometry are inputs; no CPU placement/residency owner here.
 * Device/camera/environment/attachments are borrowed. GPU append order is never reordered. */
export async function createRawGrass(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  records: Float32Array,
  tiers: readonly GrassGeometry[],
  format: GPUTextureFormat = "rgba16float",
  sampleCount: 1 | 4 = 1,
) {
  if (records.length % 16 !== 0 || tiers.length !== 3)
    throw new Error("Grass expects packed records and all three source tiers");
  const owned = new Set<GPUBuffer>();
  let disposed = false;
  const buffer = (
    size: number,
    usage: GPUBufferUsageFlags,
    data?: ArrayBufferView<ArrayBufferLike>,
  ) => {
    const b = device.createBuffer({ size, usage, mappedAtCreation: !!data });
    try {
      if (data) {
        new Uint8Array(b.getMappedRange()).set(
          new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        );
        b.unmap();
      }
    } catch (error) {
      b.destroy();
      throw error;
    }
    owned.add(b);
    return b;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const b of owned) b.destroy();
  };
  try {
    let recordCount = records.length / 16;
    let capacity = Math.max(1, recordCount);
    let packed = buffer(
      capacity * 64,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      records.length ? records : undefined,
    );
    const activeCount = buffer(
      16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      new Uint32Array([recordCount, 0, 0, 0]),
    );
    const params = buffer(224, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    const commands = buffer(
      60,
      GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_SRC,
    );
    let visible = tiers.map(() =>
      buffer(capacity * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC),
    );
    const vertices = tiers.map((t) =>
      buffer(t.positions.byteLength, GPUBufferUsage.VERTEX, t.positions),
    );
    const indices = tiers.map((t) => buffer(t.indices.byteLength, GPUBufferUsage.INDEX, t.indices));
    const routeModule = device.createShaderModule({
      code:
        grassTypesWGSL +
        grassRoutingWGSL +
        `
struct Command { indexCount:u32,instanceCount:atomic<u32>,firstIndex:u32,baseVertex:i32,firstInstance:u32 };
@group(0) @binding(0) var<storage,read> records:array<GrassRecord>;
@group(0) @binding(1) var<uniform> params:GrassParams;
@group(0) @binding(2) var<storage,read_write> commands:array<Command,3>;
@group(0) @binding(3) var<storage,read_write> nearList:array<u32>;
@group(0) @binding(4) var<storage,read_write> midList:array<u32>;
@group(0) @binding(5) var<storage,read_write> farList:array<u32>;
@group(0) @binding(6) var<uniform> activeCount:vec4u;
@compute @workgroup_size(1) fn reset(){
 let counts=array<u32,3>(${tiers.map((t) => `${t.indices.length}u`).join(",")});
 for(var i=0u;i<3u;i++){commands[i].indexCount=counts[i];atomicStore(&commands[i].instanceCount,0u);commands[i].firstIndex=0u;commands[i].baseVertex=0;commands[i].firstInstance=0u;}
}
@compute @workgroup_size(64) fn route(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=activeCount.x){return;}
 let tier=grassTier(records[id.x],params);if(tier<0){return;}
 let slot=atomicAdd(&commands[u32(tier)].instanceCount,1u);
 if(tier==0){nearList[slot]=id.x;}else if(tier==1){midList[slot]=id.x;}else{farList[slot]=id.x;}
}`,
    });
    const routeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        ...[2, 3, 4, 5].map((binding) => ({
          binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" as const },
        })),
      ],
    });
    const makeRoutingGroup = (source: GPUBuffer, lists: GPUBuffer[]) =>
      device.createBindGroup({
        layout: routeLayout,
        entries: [source, params, commands, ...lists, activeCount].map((b, binding) => ({
          binding,
          resource: { buffer: b },
        })),
      });
    let routingGroup = makeRoutingGroup(packed, visible);
    const routePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [routeLayout] });
    const [reset, route] = await Promise.all(
      ["reset", "route"].map((entryPoint) =>
        device.createComputePipelineAsync({
          layout: routePipelineLayout,
          compute: { module: routeModule, entryPoint },
        }),
      ),
    );
    const recordsLayout = device.createBindGroupLayout({
      entries: [0, 1].map((binding) => ({
        binding,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" as const },
      })),
    });
    const paramsLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const makeDrawGroups = (source: GPUBuffer, lists: GPUBuffer[]) =>
      lists.map((list) =>
        device.createBindGroup({
          layout: recordsLayout,
          entries: [
            { binding: 0, resource: { buffer: source } },
            { binding: 1, resource: { buffer: list } },
          ],
        }),
      );
    let groups = makeDrawGroups(packed, visible);
    const paramsGroup = device.createBindGroup({
      layout: paramsLayout,
      entries: [{ binding: 0, resource: { buffer: params } }],
    });
    const shader =
      WORLD_CAMERA_WGSL +
      grassTypesWGSL +
      grassVertexWGSL +
      environment.shader +
      `
@group(1) @binding(0) var<storage,read> records:array<GrassRecord>;
@group(1) @binding(1) var<storage,read> visible:array<u32>;
@group(2) @binding(0) var<uniform> grass:GrassParams;
struct VertexOut {@builtin(position) @invariant position:vec4f,@location(0) world:vec3f,@location(1) normal:vec3f,@location(2) albedo:vec3f,@location(3) weights:vec2f};
@vertex fn vertex(@location(0) local:vec3f,@builtin(instance_index) instance:u32)->VertexOut {
 let v=grassVertex(records[visible[instance]],local,grass,cam.eye,grass.view);
 return VertexOut(projectWorld(v.world),v.world,v.normal,v.albedo,v.lightWeights);
}
@fragment fn beauty(v:VertexOut)->@location(0) vec4f {
 let normal=normalize(v.normal);
 // Production blade geometry has constant (0,0,1) attribute normals; authored
 // shading normals do not feed Three's normalViewGeometry roughness derivative.
 return shadeWorldSurface(grassLinear(v.albedo),grassEmissive(normal,v.world,v.weights,grass,cam.eye),0.96,0.0,0.0,1.0,normal,v.world,1.0);
}
@fragment fn depth(v:VertexOut)->@location(0) vec4f {return vec4f(0,0,0,1);}
`;
    // Invariant clip positions keep optional depth and beauty passes bit-identical
    // despite the driver's different dead-varying optimization of each pipeline.
    const module = device.createShaderModule({ code: shader });
    const layout = device.createPipelineLayout({
      bindGroupLayouts: [cameraLayout, recordsLayout, paramsLayout, environment.layout],
    });
    const pipeline = (entryPoint: string, writeMask: number) =>
      device.createRenderPipelineAsync({
        layout,
        vertex: {
          module,
          entryPoint: "vertex",
          buffers: [
            {
              arrayStride: 12,
              attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
            },
          ],
        },
        fragment: { module, entryPoint, targets: [{ format, writeMask }] },
        primitive: { topology: "triangle-list", cullMode: "none" },
        multisample: { count: sampleCount },
        depthStencil: {
          format: "depth32float",
          depthWriteEnabled: true,
          depthCompare: "greater-equal",
        },
      });
    const [beauty, prepass] = await Promise.all([
      pipeline("beauty", GPUColorWrite.ALL),
      pipeline("depth", 0),
    ]);
    return {
      commands,
      get visible() {
        return visible;
      },
      stats() {
        return { recordCount, capacity, pipelineBuilds: 4 };
      },
      async updateRecords(next: Float32Array) {
        if (disposed) throw Error("Grass is disposed");
        if (next.length % 16 !== 0) throw Error("Grass expects complete packed records");
        if (
          next.byteLength > device.limits.maxStorageBufferBindingSize ||
          next.byteLength > device.limits.maxBufferSize
        )
          throw Error("Grass records exceed device storage limits");
        const count = next.length / 16;
        if (count > capacity) {
          device.pushErrorScope("out-of-memory");
          device.pushErrorScope("internal");
          device.pushErrorScope("validation");
          const created: GPUBuffer[] = [];
          let replacement: ReturnType<typeof makeDrawGroups> | undefined,
            newRoute: GPUBindGroup | undefined;
          let source: GPUBuffer | undefined;
          const lists: GPUBuffer[] = [];
          let failure: unknown;
          try {
            source = buffer(
              next.byteLength,
              GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
              next,
            );
            created.push(source);
            for (let i = 0; i < 3; i++) {
              const list = buffer(count * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
              lists.push(list);
              created.push(list);
            }
            replacement = makeDrawGroups(source, lists);
            newRoute = makeRoutingGroup(source, lists);
          } catch (error) {
            failure = error;
          }
          const admission = await Promise.allSettled([
            device.popErrorScope(),
            device.popErrorScope(),
            device.popErrorScope(),
          ]);
          const errors = admission.flatMap((r) =>
            r.status === "rejected" ? [String(r.reason)] : r.value ? [r.value.message] : [],
          );
          if (failure || errors.length || disposed || !source || !replacement || !newRoute) {
            for (const b of created) {
              b.destroy();
              owned.delete(b);
            }
            throw (
              failure ??
              Error(disposed ? "Grass is disposed" : `Grass upload admission: ${errors.join("; ")}`)
            );
          }
          for (const b of [packed, ...visible]) {
            b.destroy();
            owned.delete(b);
          }
          packed = source;
          visible = lists;
          groups = replacement;
          routingGroup = newRoute;
          capacity = count;
        } else if (count) device.queue.writeBuffer(packed, 0, next);
        recordCount = count;
        device.queue.writeBuffer(activeCount, 0, new Uint32Array([count, 0, 0, 0]));
      },
      update(state: GrassFrame) {
        if (disposed) throw new Error("Grass is disposed");
        device.queue.writeBuffer(params, 0, grassUniformData(state));
      },
      route(encoder: GPUCommandEncoder) {
        if (disposed) throw new Error("Grass is disposed");
        const pass = encoder.beginComputePass();
        pass.setBindGroup(0, routingGroup);
        pass.setPipeline(reset);
        pass.dispatchWorkgroups(1);
        pass.setPipeline(route);
        if (recordCount) pass.dispatchWorkgroups(Math.ceil(recordCount / 64));
        pass.end();
      },
      draw(
        pass: GPURenderPassEncoder,
        cameraGroup: GPUBindGroup,
        depthPrepass = false,
        farVisible = true,
        stage: "combined" | "depth" | "beauty" = "combined",
        onlyTier?: number,
      ) {
        if (disposed) throw new Error("Grass is disposed");
        pass.setBindGroup(0, cameraGroup);
        pass.setBindGroup(2, paramsGroup);
        pass.setBindGroup(3, environment.bindGroup);
        const drawTier = (tier: number) => {
          pass.setBindGroup(1, groups[tier]);
          pass.setVertexBuffer(0, vertices[tier]);
          pass.setIndexBuffer(indices[tier], "uint16");
          pass.drawIndexedIndirect(commands, tier * 20);
        };
        if (depthPrepass && stage !== "beauty") {
          pass.setPipeline(prepass);
          for (let tier = 0; tier < 2; tier++)
            if (onlyTier === undefined || onlyTier === tier) drawTier(tier);
        }
        if (stage !== "depth") {
          pass.setPipeline(beauty);
          for (let tier = 0; tier < (farVisible ? 3 : 2); tier++)
            if (onlyTier === undefined || onlyTier === tier) drawTier(tier);
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
