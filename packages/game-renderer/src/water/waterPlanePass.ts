import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { compileShader } from '../../../renderer-core/src/compileShader';
import { gpuMultisample, gpuOpaqueColorTarget, gpuReverseZDepthStencil, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { WATER_SHADE_WGSL, CIVSIM_WATER_COLOR_WGSL } from './waterMaterialWgsl';
import { WATER_PALETTE_WGSL } from './waterPalette';
import { waterShoreRampWgsl, LAB_OPEN_SEA_RAMP, type WaterShoreRamp } from './waterShoreRamp';
import { waterEnvironmentWgsl, WATER_ENVIRONMENTS, type WaterEnvironment } from '../environment/environment';
import type { WaterFieldSource } from './waterField';

// The candidate-agnostic open-sea pass: one tessellated plane at the battle
// horizon camera, displaced and shaded entirely through a `WaterFieldSource`. It
// calls `field.wgslSample()` to inline the field into its shader and binds
// `field.bindGroup()` at group(1) when the field has one — it never branches on
// which technique is live. `waterField` is evaluated in the vertex stage to
// displace and again in the fragment stage for a crisp per-pixel normal, so the
// swell reads as geometry rather than a flat-shaded facet grid. Shading is the
// shared neutral-grey `waterShade` (colour/foam/glint arrive in later slices).

export interface WaterPlaneRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Grid cells per side; the plane has (res+1)² vertices. */
  res: number;
}

// Near edge starts behind the camera so the sea fills to the screen bottom; the
// far edge runs past the horizon. A uniform grid suffices because per-fragment
// normals keep the near field crisp regardless of triangle size.
export const DEFAULT_WATER_PLANE: WaterPlaneRect = { x0: -420, y0: -160, x1: 420, y1: 1100, res: 340 };

// Surface-scale knobs that let the same plane serve the isolated lab open sea and a
// real coastal battle edge. The defaults reproduce the lab plane exactly (baseZ 0,
// the lab camera-distance ramp), so every frozen water-*.mjs scene stays byte-identical.
export interface WaterPlaneOptions {
  /** World z the plane floats at (its waves ride on top). Battle edges seat it at
   *  the shoreline height datum; the lab sits it at 0. */
  baseZ?: number;
  /** Depth/haze ramp. The lab keys on camera distance (LAB_OPEN_SEA_RAMP); a battle
   *  edge keys on distance-from-shore so both sides of the shoreline are one material. */
  shoreRamp?: WaterShoreRamp;
  /** When set, depth/haze key on `abs(world.x − shoreX)` (distance from the shoreline
   *  in X) instead of camera distance — the seam-closing key the field water shares. */
  shoreX?: number | null;
  /** Use the real 3D perspective camera: project through `projectReal` (camera3d's
   *  viewProj, real reverse-Z clip depth) and depth-test against a reverse-Z
   *  `depth32float` buffer — instead of the legacy 2.5D `projectWorld3d` + painter
   *  `civsimBattleWorldDepth3d`. Requires a `reverseZ` shell. Slice 02: only the
   *  water bake-off route sets this; battle's horizon ocean stays on the legacy path
   *  so it renders byte-identically. */
  real?: boolean;
}

export class WaterPlanePass {
  private readonly shell: RawFrameShell;
  private readonly field: WaterFieldSource;
  private readonly pipeline: GPURenderPipeline;
  private readonly vertexBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly indexCount: number;

  constructor(shell: RawFrameShell, field: WaterFieldSource, rect: WaterPlaneRect = DEFAULT_WATER_PLANE, env: WaterEnvironment = WATER_ENVIRONMENTS.golden, opts: WaterPlaneOptions = {}) {
    this.shell = shell;
    this.field = field;
    const device = shell.device;

    const { vertices, indices } = buildGrid(rect);
    this.indexCount = indices.length;
    this.vertexBuffer = device.createBuffer({ label: 'water-plane-verts', size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
    this.indexBuffer = device.createBuffer({ label: 'water-plane-indices', size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.indexBuffer, 0, indices);

    const fieldLayout = field.bindGroupLayout();
    const bindGroupLayouts = fieldLayout ? [shell.cameraBindGroupLayout, fieldLayout] : [shell.cameraBindGroupLayout];
    const module = compileShader(device, waterPlaneWgsl(field.wgslSample(), env, opts), `water-plane-${field.id}`);
    this.pipeline = device.createRenderPipeline({
      label: `water-plane-${field.id}-pipeline`,
      layout: device.createPipelineLayout({ bindGroupLayouts }),
      vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: opts.real ? gpuReverseZDepthStencil('read-write') : gpuWorldDepthStencil('read-write'),
      multisample: gpuMultisample(shell.sampleCount),
    });
  }

  draw(pass: WorldRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    const group = this.field.bindGroup();
    if (group) pass.setBindGroup(1, group);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.indexCount);
  }

  destroy() {
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
  }
}

function buildGrid(rect: WaterPlaneRect): { vertices: Float32Array; indices: Uint32Array } {
  const { x0, y0, x1, y1, res } = rect;
  const side = res + 1;
  const vertices = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const o = (j * side + i) * 2;
      vertices[o] = x0 + ((x1 - x0) * i) / res;
      vertices[o + 1] = y0 + ((y1 - y0) * j) / res;
    }
  }
  const indices = new Uint32Array(res * res * 6);
  let k = 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  return { vertices, indices };
}

function waterPlaneWgsl(fieldWgsl: string, env: WaterEnvironment, opts: WaterPlaneOptions): string {
  const baseZ = opts.baseZ ?? 0;
  // Two modes, both the single `civsimWaterColor` material (spec firewall #1):
  //  - Lab open sea (shoreX null): the whole isolated plane is the reference open sea,
  //    agitation 1, depth/haze keyed on camera distance. Byte-identical to the frozen
  //    look scenes.
  //  - Battle ocean edge (shoreX set): the sea meets the S8 field water at the shore, so
  //    it must MATCH it there and only become the reference sea offshore. Both depth and
  //    agitation ramp with distance-from-shore in X: at the shoreline the sea is the same
  //    calm mid-blue as the field water (agitation 0), grading to the deep, whitecapped,
  //    glittering open sea offshore, then hazing into the sky. No stripe by construction.
  const fs = opts.shoreX == null
    ? `
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let ramp = waterShoreRamp(length(in.world - vec2f(cam.x, cam.y)));
  return vec4f(civsimWaterColor(in.world, ramp.x, ramp.y, 1.0, 0.0), 1.0);
}`
    : `
const OCEAN_SHORE_DEPTH = 0.30; // depth01 at the shoreline — matches the field water's deep end (pale)
const OCEAN_DEEP_DEPTH = 0.80;  // depth01 far offshore — deep Aegean blue
// Depth and agitation ramp on DIFFERENT distances. Depth grades over a short range so
// the visible coastal sea reads pale turquoise near the beach → deeper blue offshore
// (the shallow-shelf cue). Agitation ramps far out so the whole visible sea stays
// calm and golden — the open-sea whitecaps only build near the horizon, and no
// calm↔rough boundary reads as a seam. The battle target is the calm Aegean coast,
// NOT the rough deep-ocean reference (that is the lab look).
const OCEAN_DEPTH_FAR = 500.0;
const OCEAN_AGITATE_FAR = 3200.0;
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let shoreDist = abs(in.world.x - ${opts.shoreX.toFixed(3)});
  let depth01 = mix(OCEAN_SHORE_DEPTH, OCEAN_DEEP_DEPTH, smoothstep(0.0, OCEAN_DEPTH_FAR, shoreDist));
  let agitation = smoothstep(0.0, OCEAN_AGITATE_FAR, shoreDist);
  let haze01 = waterShoreRamp(shoreDist).y;
  return vec4f(civsimWaterColor(in.world, depth01, haze01, agitation, 0.0), 1.0);
}`;
  return `
${WORLD_CAMERA_WGSL}
${fieldWgsl}
${WATER_PALETTE_WGSL}
${waterEnvironmentWgsl(env)}
${waterShoreRampWgsl(opts.shoreRamp ?? LAB_OPEN_SEA_RAMP)}
${WATER_SHADE_WGSL}
${CIVSIM_WATER_COLOR_WGSL}

const WATER_PLANE_BASE_Z = ${baseZ.toFixed(3)};

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) world: vec2f,
};

@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  let s = waterField(world, cam.time);
  let p3 = vec3f(world, WATER_PLANE_BASE_Z + s.height);
  var out: VsOut;
  out.pos = ${opts.real ? 'projectReal(p3)' : 'projectWorld3d(p3, civsimBattleWorldDepth3d(p3))'};
  out.world = world;
  return out;
}
${fs}`;
}
