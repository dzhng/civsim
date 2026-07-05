import type { RawFrameShell, WorldRenderPass } from "../../../renderer-core/src/frameShell";
import { WORLD_CAMERA_WGSL } from "../../../renderer-core/src/cameraWgsl";
import {
  gpuAlphaBlendColorTarget,
  gpuWorldDepthStencil,
} from "../../../renderer-core/src/pipelineContracts";
import { SELECTION_RING_PROFILE } from "../selectionRing";

export interface CampaignSelectionInstance {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: [number, number, number];
  kind: "city" | "army" | "garrisoned-army";
}

// The army-ring band/fill numbers come from the shared cross-substrate
// profile (battle's TSL ring layer reads the same object).
const P = SELECTION_RING_PROFILE;

const SELECTION_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) kind: f32,
};

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst0: vec4f, @location(2) inst1: vec4f) -> VsOut {
  let axisScale = select(0.76, 0.64, inst0.w > 0.5);
  let world = inst0.xy + vec2f(quad.x * inst0.z, quad.y * inst0.z * axisScale);
  // Lift just above the terrain surface; world geometry still occludes via depth.
  let z = inst1.a + 0.045;
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, z));
  out.local = quad;
  out.color = inst1.rgb;
  out.kind = inst0.w;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let d = length(in.local);
  let strongArmy = in.kind > 0.5;
  let garrisonedArmy = in.kind > 1.5;
  var innerCut = select(0.884, ${P.innerCut}, strongArmy);
  innerCut = select(innerCut, 0.856, garrisonedArmy);
  var innerFade = select(0.912, ${P.innerFade}, strongArmy);
  innerFade = select(innerFade, 0.890, garrisonedArmy);
  if (d > 1.0 || d < innerCut) { discard; }
  let outer = smoothstep(1.0, ${P.outerEdge}, d);
  let inner = smoothstep(innerCut, innerFade, d);
  let ring = outer * inner;
  let fill = smoothstep(${P.fillOuterStart}, ${P.fillOuterEnd}, d) * smoothstep(innerCut - ${P.fillInnerBelowCut}, innerCut + ${P.fillInnerAboveCut}, d) * ${P.fillAlpha};
  let armyMix = select(0.18, 0.0, strongArmy);
  // City ring (kind 0) read as a low-contrast grey over green turf (05a critique):
  // it washed the green status colour 40% toward parchment-gold at 0.68 alpha.
  // Keep the diegetic soft ring but let the green carry — a lighter parchment
  // wash and a firmer alpha, matching the army ring's legibility.
  let groundTint = mix(in.color, vec3f(0.74, 0.66, 0.36), select(0.20, armyMix, in.kind > 0.5));
  let armyBoost = select(0.13, select(0.10, 0.22, strongArmy), in.kind > 0.5);
  var ringAlpha = select(${P.ringAlpha}, select(0.86, ${P.ringAlpha}, strongArmy), in.kind > 0.5);
  ringAlpha = select(ringAlpha, ${P.ringAlpha}, garrisonedArmy);
  return vec4f(groundTint * (0.86 + armyBoost), max(ring * ringAlpha, fill));
}`;

export class CampaignSelectionPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private count = 0;
  private garrisonedArmyCount = 0;
  private maxRadius = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({
      label: "campaign-selection-wgsl",
      code: SELECTION_WGSL,
    });
    this.pipeline = this.makePipeline(module);
    this.quadBuffer = device.createBuffer({
      label: "campaign-selection-quad",
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({
      label: "campaign-selection-empty",
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private makePipeline(module: GPUShaderModule) {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: "campaign-selection-depth-pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
          {
            arrayStride: 32,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 1, offset: 0, format: "float32x4" },
              { shaderLocation: 2, offset: 16, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [gpuAlphaBlendColorTarget(this.shell.info.format)],
      },
      primitive: { topology: "triangle-strip" },
      // Real depth read: the ring is a ground decal, so the city/army
      // volume standing on it must occlude the far arc — compare "always"
      // drew the ring floating above the buildings.
      depthStencil: gpuWorldDepthStencil("read"),
    });
  }

  upload(instances: CampaignSelectionInstance[]) {
    this.count = instances.length;
    this.garrisonedArmyCount = instances.filter((inst) => inst.kind === "garrisoned-army").length;
    this.maxRadius = instances.reduce((max, inst) => Math.max(max, inst.radius), 0);
    if (instances.length > this.capacity) {
      this.capacity = Math.max(instances.length, this.capacity * 2, 8);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: "campaign-selection-instances",
        size: this.capacity * 8 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (instances.length === 0) return;
    const data = new Float32Array(instances.length * 8);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const o = i * 8;
      data[o] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = inst.radius;
      data[o + 3] = inst.kind === "city" ? 0 : inst.kind === "garrisoned-army" ? 2 : 1;
      data.set(inst.color, o + 4);
      data[o + 7] = inst.z;
    }
    this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  draw(pass: WorldRenderPass) {
    this.drawWithPipeline(pass, this.pipeline);
  }

  private drawWithPipeline(pass: WorldRenderPass, pipeline: GPURenderPipeline) {
    if (this.count === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(4, this.count);
  }

  stats() {
    return {
      selections: this.count,
      garrisonedArmySelections: this.garrisonedArmyCount,
      maxSelectionRadius: this.maxRadius,
    };
  }
}
