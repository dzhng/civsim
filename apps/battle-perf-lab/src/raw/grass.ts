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
/** Frozen records and exact source geometry are inputs; no CPU placement/residency owner here.
 * Device/camera/environment/attachments are borrowed. GPU append order is never reordered. */
export async function createRawGrass(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  records: Float32Array,
  tiers: readonly GrassGeometry[],
  format: GPUTextureFormat = "rgba16float",
) {
  if (records.length === 0 || records.length % 16 !== 0 || tiers.length !== 3)
    throw new Error("Grass expects packed records and all three source tiers");
  const owned: GPUBuffer[] = [];
  let disposed = false;
  const buffer = (
    size: number,
    usage: GPUBufferUsageFlags,
    data?: ArrayBufferView<ArrayBufferLike>,
  ) => {
    const b = device.createBuffer({ size, usage, mappedAtCreation: !!data });
    if (data) {
      new Uint8Array(b.getMappedRange()).set(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      );
      b.unmap();
    }
    owned.push(b);
    return b;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const b of owned) b.destroy();
  };
  try {
    const recordCount = records.length / 16;
    const packed = buffer(records.byteLength, GPUBufferUsage.STORAGE, records);
    const params = buffer(224, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    const commands = buffer(
      60,
      GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_SRC,
    );
    const visible = tiers.map(() =>
      buffer(recordCount * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC),
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
@compute @workgroup_size(1) fn reset(){
 let counts=array<u32,3>(${tiers.map((t) => `${t.indices.length}u`).join(",")});
 for(var i=0u;i<3u;i++){commands[i].indexCount=counts[i];atomicStore(&commands[i].instanceCount,0u);commands[i].firstIndex=0u;commands[i].baseVertex=0;commands[i].firstInstance=0u;}
}
@compute @workgroup_size(64) fn route(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=arrayLength(&records)){return;}
 let tier=grassTier(records[id.x],params);if(tier<0){return;}
 let slot=atomicAdd(&commands[u32(tier)].instanceCount,1u);
 if(tier==0){nearList[slot]=id.x;}else if(tier==1){midList[slot]=id.x;}else{farList[slot]=id.x;}
}`,
    });
    const routeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        ...[2, 3, 4, 5].map((binding) => ({
          binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" as const },
        })),
      ],
    });
    const routingGroup = device.createBindGroup({
      layout: routeLayout,
      entries: [packed, params, commands, ...visible].map((b, binding) => ({
        binding,
        resource: { buffer: b },
      })),
    });
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
    const groups = visible.map((list) =>
      device.createBindGroup({
        layout: recordsLayout,
        entries: [
          { binding: 0, resource: { buffer: packed } },
          { binding: 1, resource: { buffer: list } },
        ],
      }),
    );
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
      visible,
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
        pass.dispatchWorkgroups(Math.ceil(recordCount / 64));
        pass.end();
      },
      draw(pass: GPURenderPassEncoder, cameraGroup: GPUBindGroup, depthPrepass = false) {
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
        if (depthPrepass) {
          pass.setPipeline(prepass);
          drawTier(0);
          drawTier(1);
        }
        pass.setPipeline(beauty);
        for (let tier = 0; tier < 3; tier++) drawTier(tier);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
