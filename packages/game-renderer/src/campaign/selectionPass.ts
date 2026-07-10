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

// Ring geometry is a CPU-tessellated annulus whose vertices sample the
// terrain height field (the same drape contract as faction borders), so the
// ring hugs slopes instead of getting buried where the ground rises across a
// flat quad. `local` carries the radial coordinate the band profile reads.
const RING_SEGMENTS = 48;
/** Innermost tessellated radius fraction — just under the tightest
 *  discard cut (garrisoned 0.856 minus the fill band below it). */
const RING_INNER_FRACTION = 0.8;
/** Lift above the sampled surface; world geometry still occludes via depth.
 *  Sits above the road ribbons (height + 0.32) so a selection cue reads over
 *  every ground decal, below the sea lanes (0.6). */
const RING_SURFACE_LIFT = 0.42;
const RING_FLOATS_PER_VERTEX = 9;
const RING_VERTS_PER_INSTANCE = RING_SEGMENTS * 6;

const SELECTION_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) kind: f32,
};

@vertex
fn vs(
  @location(0) pos: vec3f,
  @location(1) local: vec2f,
  @location(2) color: vec3f,
  @location(3) kind: f32,
) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(pos);
  out.local = local;
  out.color = color;
  out.kind = kind;
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
  private vertexBuffer: GPUBuffer;
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
    this.vertexBuffer = device.createBuffer({
      label: "campaign-selection-empty",
      size: RING_FLOATS_PER_VERTEX * 4,
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
          {
            arrayStride: RING_FLOATS_PER_VERTEX * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x2" },
              { shaderLocation: 2, offset: 20, format: "float32x3" },
              { shaderLocation: 3, offset: 32, format: "float32" },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [gpuAlphaBlendColorTarget(this.shell.info.format)],
      },
      primitive: { topology: "triangle-list" },
      // Real depth read: the ring is a ground decal, so the city/army
      // volume standing on it must occlude the far arc — compare "always"
      // drew the ring floating above the buildings.
      depthStencil: gpuWorldDepthStencil("read"),
    });
  }

  /** Tessellate each ring against the terrain surface. `heightAt` is the one
   *  height owner (the same field the terrain mesh and border drapes read);
   *  without it a vertex falls back to the instance's center height. */
  upload(instances: CampaignSelectionInstance[], heightAt?: (x: number, y: number) => number) {
    this.count = instances.length;
    this.garrisonedArmyCount = instances.filter((inst) => inst.kind === "garrisoned-army").length;
    this.maxRadius = instances.reduce((max, inst) => Math.max(max, inst.radius), 0);
    const floats = instances.length * RING_VERTS_PER_INSTANCE * RING_FLOATS_PER_VERTEX;
    if (floats > this.capacity) {
      this.capacity = Math.max(floats, this.capacity * 2);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: "campaign-selection-rings",
        size: this.capacity * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (instances.length === 0) return;
    const data = new Float32Array(floats);
    let o = 0;
    const vertex = (
      inst: CampaignSelectionInstance,
      kind: number,
      axisScale: number,
      seg: number,
      fraction: number,
    ) => {
      const angle = (seg / RING_SEGMENTS) * Math.PI * 2;
      const lx = Math.cos(angle) * fraction;
      const ly = Math.sin(angle) * fraction;
      const x = inst.x + lx * inst.radius;
      const y = inst.y + ly * inst.radius * axisScale;
      data[o++] = x;
      data[o++] = y;
      data[o++] = (heightAt ? heightAt(x, y) : inst.z) + RING_SURFACE_LIFT;
      data[o++] = lx;
      data[o++] = ly;
      data[o++] = inst.color[0];
      data[o++] = inst.color[1];
      data[o++] = inst.color[2];
      data[o++] = kind;
    };
    for (const inst of instances) {
      const kind = inst.kind === "city" ? 0 : inst.kind === "garrisoned-army" ? 2 : 1;
      const axisScale = kind === 0 ? 0.76 : 0.64;
      for (let seg = 0; seg < RING_SEGMENTS; seg++) {
        vertex(inst, kind, axisScale, seg, RING_INNER_FRACTION);
        vertex(inst, kind, axisScale, seg, 1);
        vertex(inst, kind, axisScale, seg + 1, 1);
        vertex(inst, kind, axisScale, seg, RING_INNER_FRACTION);
        vertex(inst, kind, axisScale, seg + 1, 1);
        vertex(inst, kind, axisScale, seg + 1, RING_INNER_FRACTION);
      }
    }
    this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, data);
  }

  draw(pass: WorldRenderPass) {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.count * RING_VERTS_PER_INSTANCE);
  }

  stats() {
    return {
      selections: this.count,
      garrisonedArmySelections: this.garrisonedArmyCount,
      maxSelectionRadius: this.maxRadius,
    };
  }
}
