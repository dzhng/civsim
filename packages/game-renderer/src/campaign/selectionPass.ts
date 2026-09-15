import type { RawFrameShell, WorldRenderPass } from "../../../renderer-core/src/frameShell";
import { WORLD_CAMERA_WGSL } from "../../../renderer-core/src/cameraWgsl";
import { GrowableBuffer } from "../../../renderer-core/src/gpuBuffers";
import { cameraOnlyPipeline } from "../../../renderer-core/src/pipelineContracts";
import { SELECTION_RING_PROFILE } from "../selectionRing";

import {
  CAMPAIGN_SELECTION_STYLE,
  CAMPAIGN_SELECTION_VERTEX_FLOATS as RING_FLOATS_PER_VERTEX,
  campaignSelectionVertices,
  type CampaignSelectionInstance,
} from "./selection";
const P = SELECTION_RING_PROFILE;
const cityStyle = CAMPAIGN_SELECTION_STYLE.city;
const armyStyle = CAMPAIGN_SELECTION_STYLE.army;
const garrisonStyle = CAMPAIGN_SELECTION_STYLE["garrisoned-army"];
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
  var innerCut = select(${cityStyle.innerCut}, ${P.innerCut}, strongArmy);
  innerCut = select(innerCut, ${garrisonStyle.innerCut}, garrisonedArmy);
  var innerFade = select(${cityStyle.innerFade}, ${P.innerFade}, strongArmy);
  innerFade = select(innerFade, ${garrisonStyle.innerFade}, garrisonedArmy);
  if (d > 1.0 || d < innerCut) { discard; }
  let outer = smoothstep(1.0, ${P.outerEdge}, d);
  let inner = smoothstep(innerCut, innerFade, d);
  let ring = outer * inner;
  let fill = smoothstep(${P.fillOuterStart}, ${P.fillOuterEnd}, d) * smoothstep(innerCut - ${P.fillInnerBelowCut}, innerCut + ${P.fillInnerAboveCut}, d) * ${P.fillAlpha};
  let groundTint = mix(in.color, vec3f(0.74, 0.66, 0.36), select(${cityStyle.tint}, ${armyStyle.tint}, strongArmy));
  let brightness = select(${cityStyle.brightness}, ${armyStyle.brightness}, strongArmy);
  return vec4f(groundTint * brightness, max(ring * ${P.ringAlpha}, fill));
}`;

export class CampaignSelectionPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GrowableBuffer;
  private count = 0;
  private vertexCount = 0;
  private garrisonedArmyCount = 0;
  private maxRadius = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({
      label: "campaign-selection-wgsl",
      code: SELECTION_WGSL,
    });
    this.pipeline = this.makePipeline(module);
    this.vertexBuffer = new GrowableBuffer(
      device,
      "campaign-selection-rings",
      GPUBufferUsage.VERTEX,
      128,
    );
  }

  private makePipeline(module: GPUShaderModule) {
    return cameraOnlyPipeline(this.shell, {
      label: "campaign-selection-depth-pipeline",
      module,
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
      target: "alpha",
      // Real depth read: the ring is a ground decal, so the city/army
      // volume standing on it must occlude the far arc — compare "always"
      // drew the ring floating above the buildings.
      depth: "read",
    });
  }

  /** Tessellate each ring against the terrain surface. `heightAt` is the one
   *  height owner (the same field the terrain mesh and border drapes read);
   *  without it a vertex falls back to the instance's center height. */
  upload(instances: CampaignSelectionInstance[], heightAt?: (x: number, y: number) => number) {
    this.count = instances.length;
    this.garrisonedArmyCount = instances.filter((inst) => inst.kind === "garrisoned-army").length;
    this.maxRadius = instances.reduce((max, inst) => Math.max(max, inst.radius), 0);
    const data = campaignSelectionVertices(instances, heightAt);
    this.vertexCount = data.length / RING_FLOATS_PER_VERTEX;
    if (data.length) this.vertexBuffer.write(data);
  }

  draw(pass: WorldRenderPass) {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer.buffer);
    pass.draw(this.vertexCount);
  }

  stats() {
    return {
      selections: this.count,
      garrisonedArmySelections: this.garrisonedArmyCount,
      maxSelectionRadius: this.maxRadius,
    };
  }
}
