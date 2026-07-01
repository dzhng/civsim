// Slice 06 photoreal-substrate bake-off — BESPOKE prong (throwaway spike).
// Three probes on the real 3D perspective camera + reverse-Z:
//   /renderer/pbr-probe   — metal×roughness sphere grid via a minimal pbr WGSL
//   /renderer/water-pbr   — PBR water vista (Fresnel sky reflection + GGX sun
//                           specular + depth turbidity) on the production
//                           Gerstner field at the real horizon
//   /renderer/crowd-perf  — 30k+ VAT-skinned soldiers + dense grass + trees,
//                           frame-time probe (mid/vista cameras)
// Camera presets + lighting are the SHARED bake-off contract — the three.js
// prong (web/src/three-probe/*) uses the same numbers so shots and frame times
// compare apples-to-apples. Spike code: not production, deleted after `06`.

import { createFrameShell, type RawFrameShell, type WorldRenderPass } from '../../../packages/renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../packages/renderer-core/src/cameraWgsl';
import { compileShader } from '../../../packages/renderer-core/src/compileShader';
import { gpuMultisample, gpuOpaqueColorTarget, gpuReverseZDepthStencil } from '../../../packages/renderer-core/src/pipelineContracts';
import { eyePosition, projectPoint, type Camera3DParams } from '../../../packages/renderer-core/src/camera3d';
import { SkinnedCrowdPipeline } from '../../../packages/renderer-core/src/skinnedPipeline';
import { SoldierShadowDecalPass } from '../../../packages/renderer-core/src/soldierShadowPass';
import { createWaterField } from '../../../packages/game-renderer/src/water/waterField';
import { waterShoreRampWgsl, LAB_OPEN_SEA_RAMP } from '../../../packages/game-renderer/src/water/waterShoreRamp';
import { resolveBattleEnvironment, skinnedLightingForBattleEnvironment } from '../../../packages/game-renderer/src/environment/environment';
import { BattleGroundPass } from '../../../packages/game-renderer/src/battle/groundPass';
import { BattleGrassPass } from '../../../packages/game-renderer/src/battle/grassPass';
import { CampaignSceneryPass, type CampaignSceneryInstance } from '../../../packages/game-renderer/src/campaign/sceneryPass';
import { terrainHeightField, type BattleTerrainGrid } from '../../../packages/game-renderer/src/battle/terrainFeatures';
import { generatedFormation, type CrowdInstance } from '../../../packages/crowd-runtime/src/instanceData';
import { assignLodForScreenSize } from '../../../packages/crowd-runtime/src/lod';
import { loadPlaceholderVat } from '../../../packages/soldier-assets/src/placeholders';
import { createPlaceholderSoldierMeshTiers } from '../../../packages/soldier-assets/src/soldierMesh';

interface ProbeContext {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  params: URLSearchParams;
}

// ---------------------------------------------------------------------------
// Shared bake-off contract (mirrored by web/src/three-probe/shared.ts)

const YAW = -Math.PI / 2; // eye south of target, looking north (+y)

export const BAKEOFF_CAMERAS = {
  water: { target: [0, 140, 0], distance: 190, pitch: 0.22, yaw: YAW, fovY: 0.78, near: 1 },
  pbr: { target: [0, 0, 2], distance: 42, pitch: 0.5, yaw: YAW, fovY: 0.7, near: 1 },
  crowdMid: { target: [0, 40, 0], distance: 380, pitch: 0.8, yaw: YAW, fovY: 0.68, near: 1 },
  crowdVista: { target: [0, 90, 0], distance: 210, pitch: 0.3, yaw: YAW, fovY: 0.83, near: 1 },
} as const;

// Golden-hour lighting (CIVSIM_ENVIRONMENTS.golden): sun az π/2, el 0.5.
const SUN_AZ = Math.PI / 2;
const SUN_EL = 0.5;

interface ProbeStats {
  route: string;
  substrate: 'bespoke';
  cameraPreset?: string;
  soldiers?: number;
  trees?: number;
  grassBlades?: number;
  frames: number;
  medianMs: number | null;
  p95Ms: number | null;
  gpuTimeMs: number | null;
  drawCalls?: number | null;
  [k: string]: unknown;
}

function publishProbe(stats: ProbeStats) {
  const w = window as unknown as { __rendererLabReady?: boolean; __rendererLabStats?: unknown; __probeStats?: unknown };
  w.__rendererLabReady = true;
  w.__rendererLabStats = { ok: true, ...stats };
  w.__probeStats = stats;
}

// Rolling rAF frame-time sampler shared by the probes: skip 60 warmup frames,
// keep the last 300 samples, report median + p95.
function createFrameSampler() {
  const samples: number[] = [];
  let last: number | null = null;
  let warmup = 60;
  return {
    tick() {
      const now = performance.now();
      if (last !== null) {
        if (warmup > 0) warmup--;
        else {
          samples.push(now - last);
          if (samples.length > 300) samples.shift();
        }
      }
      last = now;
    },
    stats(): { frames: number; medianMs: number | null; p95Ms: number | null } {
      if (samples.length === 0) return { frames: 0, medianMs: null, p95Ms: null };
      const sorted = [...samples].sort((a, b) => a - b);
      return {
        frames: samples.length,
        medianMs: sorted[Math.floor(sorted.length * 0.5)],
        p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      };
    },
  };
}

function camera3dFor(preset: { target: readonly number[]; distance: number; pitch: number; yaw: number; fovY: number; near: number }, aspect: number): Camera3DParams {
  return {
    target: [preset.target[0], preset.target[1], preset.target[2]],
    distance: preset.distance,
    pitch: preset.pitch,
    yaw: preset.yaw,
    fovY: preset.fovY,
    aspect,
    near: preset.near,
  };
}

function applyRealCamera(shell: RawFrameShell, cam: Camera3DParams) {
  const eye = eyePosition(cam);
  shell.setCamera({ x: eye[0], y: eye[1], zoom: 1, pitch: cam.pitch, yaw: cam.yaw, camera3d: cam });
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Shared WGSL: procedural sky + minimal PBR BRDF + tone map. The sky doubles as
// the Fresnel reflection environment for the PBR water and the sphere grid's
// (very) minimal IBL analog.

const SKY_PBR_WGSL = `
const PI = 3.14159265;
const SKY_ZENITH = vec3f(0.33, 0.50, 0.72);
const SKY_HORIZON = vec3f(0.82, 0.80, 0.70);
const SKY_AVG = vec3f(0.58, 0.63, 0.70);
const SUN_COLOR = vec3f(1.0, 0.86, 0.62);
const GROUND_BOUNCE = vec3f(0.30, 0.27, 0.18);

fn skyColor(dirIn: vec3f) -> vec3f {
  let dir = normalize(dirIn);
  let t = clamp(dir.z, 0.0, 1.0);
  var sky = mix(SKY_HORIZON, SKY_ZENITH, pow(t, 0.6));
  let d = clamp(dot(dir, sunDirection()), 0.0, 1.0);
  sky += SUN_COLOR * (pow(d, 1400.0) * 24.0 + pow(d, 32.0) * 0.35);
  // Below the horizon a reflection ray sees ground, not sky — this also kills
  // the fake all-around Fresnel rim on the sphere grid's shadow side.
  return mix(GROUND_BOUNCE, sky, smoothstep(-0.12, 0.04, dir.z));
}

// The background dome only: never folds to ground — below-horizon rays clamp to
// the horizon color so a finite sea plane's far edge dissolves seamlessly.
fn skyBackground(dirIn: vec3f) -> vec3f {
  let dir = normalize(dirIn);
  return skyColor(vec3f(dir.xy, max(dir.z, 0.004)));
}

fn dGGX(NdotH: f32, rough: f32) -> f32 {
  let a = max(rough * rough, 0.002);
  let a2 = a * a;
  let d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn gSmith(NdotV: f32, NdotL: f32, rough: f32) -> f32 {
  let r = rough + 1.0;
  let k = (r * r) / 8.0;
  let gv = NdotV / (NdotV * (1.0 - k) + k);
  let gl = NdotL / (NdotL * (1.0 - k) + k);
  return gv * gl;
}

fn fresnelSchlick(cosTheta: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Direct sun + hemisphere ambient + sky-reflection ambient specular.
fn pbrShade(N: vec3f, V: vec3f, albedo: vec3f, metal: f32, rough: f32) -> vec3f {
  let L = sunDirection();
  let H = normalize(V + L);
  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 1e-4);
  let NdotH = max(dot(N, H), 0.0);
  let f0 = mix(vec3f(0.04), albedo, metal);
  let F = fresnelSchlick(max(dot(H, V), 0.0), f0);
  let spec = dGGX(NdotH, rough) * gSmith(NdotV, NdotL, rough) / max(4.0 * NdotV * NdotL, 1e-4) * F;
  let kd = (vec3f(1.0) - F) * (1.0 - metal);
  let sunRadiance = SUN_COLOR * 3.4;
  var col = (kd * albedo / PI + spec) * sunRadiance * NdotL;
  // Hemisphere diffuse irradiance (sky above, warm ground bounce below).
  let irr = mix(GROUND_BOUNCE, SKY_AVG, N.z * 0.5 + 0.5);
  col += albedo * irr * (1.0 - metal) * 0.5;
  // Ambient specular: the sky gradient sampled along R, dulled by roughness —
  // the spike's stand-in for a prefiltered environment map.
  let R = reflect(-V, N);
  let env = mix(skyColor(R), SKY_AVG * 0.85, clamp(rough * 1.2, 0.0, 1.0));
  col += env * fresnelSchlick(NdotV, f0) * (1.0 - rough * 0.72);
  return col;
}

fn tonemapACES(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn displayColor(linear: vec3f) -> vec3f {
  return pow(tonemapACES(linear), vec3f(1.0 / 2.2));
}
`;

// ---------------------------------------------------------------------------
// Sky background pass: fullscreen triangle at the far plane (reverse-Z depth 0,
// compare greater-equal so it fills exactly the untouched background).

class SkyBackgroundPass {
  private pipeline: GPURenderPipeline;
  constructor(private shell: RawFrameShell) {
    const module = compileShader(shell.device, `
${WORLD_CAMERA_WGSL}
${SKY_PBR_WGSL}
struct VsOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  let xy = vec2f(f32(i32(i % 2u) * 4 - 1), f32(i32(i / 2u) * 4 - 1));
  var out: VsOut;
  out.pos = vec4f(xy, 0.0, 1.0);
  out.ndc = xy;
  return out;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  // Ray through the pixel: unproject the near plane (reverse-Z depth 1).
  let nearH = cam.invViewProj * vec4f(in.ndc, 1.0, 1.0);
  let dir = nearH.xyz / nearH.w - cam.eye;
  return vec4f(displayColor(skyBackground(dir)), 1.0);
}`, 'bakeoff-sky');
    this.pipeline = shell.device.createRenderPipeline({
      label: 'bakeoff-sky-pipeline',
      layout: shell.device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list' },
      depthStencil: gpuReverseZDepthStencil('read', 'greater-equal'),
      multisample: gpuMultisample(shell.sampleCount),
    });
  }
  draw(pass: WorldRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.draw(3);
  }
}

// ---------------------------------------------------------------------------
// /renderer/pbr-probe — instanced UV spheres, metal by row × roughness by column,
// plus one giant ground "sphere" (radius 4000, top at z=0 — flat at this framing)
// through the same pipeline.

function buildUvSphere(latBands: number, lonBands: number): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat / latBands) * Math.PI;
    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon / lonBands) * 2 * Math.PI;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.sin(theta) * Math.sin(phi);
      const z = Math.cos(theta);
      verts.push(x, y, z, x, y, z);
    }
  }
  const idx: number[] = [];
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const a = lat * (lonBands + 1) + lon;
      const b = a + lonBands + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

export async function routePbrProbe(ctx: ProbeContext) {
  const shell = await createFrameShell(ctx.canvas, { enableGpuTimer: true, reverseZ: true });
  const aspect = ctx.canvas.clientWidth && ctx.canvas.clientHeight ? ctx.canvas.clientWidth / ctx.canvas.clientHeight : 1000 / 600;
  applyRealCamera(shell, camera3dFor(BAKEOFF_CAMERAS.pbr, aspect));
  shell.setSun(SUN_AZ, SUN_EL);

  const device = shell.device;
  const sphere = buildUvSphere(32, 48);
  const vertexBuffer = device.createBuffer({ label: 'pbr-sphere-verts', size: sphere.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vertexBuffer, 0, sphere.vertices);
  const indexBuffer = device.createBuffer({ label: 'pbr-sphere-indices', size: sphere.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(indexBuffer, 0, sphere.indices);

  // 7×7 grid: metalness by row (south→north 0→1), roughness by column (west→east
  // 0.05→1). Bronze dielectric base so the metal row reads as bronze (Aegean).
  const grid = 7;
  const spacing = 4;
  const inst: number[] = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const metal = row / (grid - 1);
      const rough = 0.05 + (col / (grid - 1)) * 0.95;
      inst.push(
        (col - (grid - 1) / 2) * spacing, (row - (grid - 1) / 2) * spacing, 2, 1.5,
        0.62, 0.36, 0.15, metal,
        rough, 0, 0, 0,
      );
    }
  }
  // Ground: giant sphere tangent to z=0 from below.
  inst.push(0, 0, -4000, 4000, 0.42, 0.4, 0.28, 0, 0.95, 0, 0, 0);
  const instanceCount = inst.length / 12;
  const instData = new Float32Array(inst);
  const instanceBuffer = device.createBuffer({ label: 'pbr-sphere-instances', size: instData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(instanceBuffer, 0, instData);

  const module = compileShader(device, `
${WORLD_CAMERA_WGSL}
${SKY_PBR_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) albedo: vec3f,
  @location(3) mr: vec2f,
};
@vertex
fn vs(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) inst0: vec4f,
  @location(3) inst1: vec4f,
  @location(4) inst2: vec4f,
) -> VsOut {
  let world = inst0.xyz + position * inst0.w;
  var out: VsOut;
  out.pos = projectReal(world);
  out.world = world;
  out.normal = normal;
  out.albedo = inst1.xyz;
  out.mr = vec2f(inst1.w, inst2.x);
  return out;
}
@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let V = normalize(cam.eye - in.world);
  let col = pbrShade(N, V, in.albedo, in.mr.x, in.mr.y);
  return vec4f(displayColor(col), 1.0);
}`, 'bakeoff-pbr-spheres');
  const pipeline = device.createRenderPipeline({
    label: 'bakeoff-pbr-spheres-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
    vertex: {
      module, entryPoint: 'vs',
      buffers: [
        { arrayStride: 24, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ] },
        { arrayStride: 48, stepMode: 'instance', attributes: [
          { shaderLocation: 2, offset: 0, format: 'float32x4' },
          { shaderLocation: 3, offset: 16, format: 'float32x4' },
          { shaderLocation: 4, offset: 32, format: 'float32x4' },
        ] },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: gpuReverseZDepthStencil('read-write'),
    multisample: gpuMultisample(shell.sampleCount),
  });

  const sky = new SkyBackgroundPass(shell);
  const sampler = createFrameSampler();
  const fixedT = ctx.params.has('t') ? Number(ctx.params.get('t')) : null;
  const t0 = performance.now();
  const tick = () => {
    shell.setTime(fixedT ?? (performance.now() - t0) / 1000);
    shell.drawFrame({
      clear: { r: 0.82, g: 0.8, b: 0.7, a: 1 },
      passes: [
        {
          id: 'pbr-probe-spheres', role: 'world-opaque', phase: 'world-depth', depth: 'read-write',
          draw: (pass) => {
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, shell.cameraBindGroup);
            pass.setVertexBuffer(0, vertexBuffer);
            pass.setVertexBuffer(1, instanceBuffer);
            pass.setIndexBuffer(indexBuffer, 'uint32');
            pass.drawIndexed(sphere.indices.length, instanceCount);
          },
        },
        { id: 'pbr-probe-sky', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => sky.draw(pass) },
      ],
    });
    sampler.tick();
    const s = shell.stats();
    publishProbe({
      route: 'pbr-probe', substrate: 'bespoke', spheres: instanceCount - 1,
      ...sampler.stats(), gpuTimeMs: s.gpuTimeMs, drawCalls: 2, depth: s.depth,
    });
    ctx.status.innerHTML = `<table><tr><td>route</td><td>pbr-probe (bespoke)</td></tr><tr><td>spheres</td><td>${instanceCount - 1}</td></tr><tr><td>gpu ms</td><td>${s.gpuTimeMs?.toFixed(3) ?? 'pending'}</td></tr></table>`;
    requestAnimationFrame(tick);
  };
  tick();
}

// ---------------------------------------------------------------------------
// /renderer/water-pbr — the slice-02 open-sea plane re-shaded PBR: Schlick
// Fresnel reflecting the procedural sky (sun disc included), GGX sun specular,
// depth-turbidity water body, aerial haze; same Gerstner field, same framing as
// /renderer/water-bakeoff.

export async function routeWaterPbr(ctx: ProbeContext) {
  // ?agitation=0..1 — same dial as production civsimWaterColor: 1 = the rough
  // reference open sea, 0 = the calm coastal Aegean (flattened swell, no caps).
  const agitation = Math.max(0, Math.min(1, Number(ctx.params.get('agitation') ?? 1)));
  const shell = await createFrameShell(ctx.canvas, { enableGpuTimer: true, reverseZ: true });
  const aspect = ctx.canvas.clientWidth && ctx.canvas.clientHeight ? ctx.canvas.clientWidth / ctx.canvas.clientHeight : 1000 / 600;
  const cam3d = camera3dFor(BAKEOFF_CAMERAS.water, aspect);
  applyRealCamera(shell, cam3d);
  shell.setSun(SUN_AZ, SUN_EL);

  const device = shell.device;
  const field = createWaterField(shell);
  // Same plane extent/resolution as the production DEFAULT_WATER_PLANE.
  const rect = { x0: -420, y0: -160, x1: 420, y1: 1100, res: 340 };
  const side = rect.res + 1;
  const verts = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const o = (j * side + i) * 2;
      verts[o] = rect.x0 + ((rect.x1 - rect.x0) * i) / rect.res;
      verts[o + 1] = rect.y0 + ((rect.y1 - rect.y0) * j) / rect.res;
    }
  }
  const idx = new Uint32Array(rect.res * rect.res * 6);
  let k = 0;
  for (let j = 0; j < rect.res; j++) {
    for (let i = 0; i < rect.res; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const vertexBuffer = device.createBuffer({ label: 'water-pbr-verts', size: verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vertexBuffer, 0, verts);
  const indexBuffer = device.createBuffer({ label: 'water-pbr-indices', size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(indexBuffer, 0, idx);

  const fieldLayout = field.bindGroupLayout();
  const layouts = fieldLayout ? [shell.cameraBindGroupLayout, fieldLayout] : [shell.cameraBindGroupLayout];
  const module = compileShader(device, `
${WORLD_CAMERA_WGSL}
${field.wgslSample()}
${waterShoreRampWgsl(LAB_OPEN_SEA_RAMP)}
${SKY_PBR_WGSL}

const WATER_SHALLOW_BODY = vec3f(0.035, 0.17, 0.20);
const WATER_DEEP_BODY = vec3f(0.008, 0.05, 0.11);
const WATER_F0 = vec3f(0.02);
const WATER_AGITATION = __AGI__;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) world: vec2f,
};

@vertex
fn vs(@location(0) world: vec2f) -> VsOut {
  let s = waterField(world, cam.time);
  var out: VsOut;
  out.pos = projectReal(vec3f(world, s.height * mix(0.35, 1.0, WATER_AGITATION)));
  out.world = world;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  var s = waterField(in.world, cam.time);
  // The production agitation dial (civsimWaterColor): flatten the swell normal
  // toward up and scale the whitecap foam as agitation falls.
  s.normal = mix(vec3f(0.0, 0.0, 1.0), s.normal, mix(0.30, 1.0, WATER_AGITATION));
  s.foam = s.foam * WATER_AGITATION;
  var N = normalize(s.normal);
  let P = vec3f(in.world, s.height);
  let V = normalize(cam.eye - P);
  // Keep the normal on the camera side so grazing Fresnel never inverts.
  N = normalize(mix(N, vec3f(0.0, 0.0, 1.0), 0.06));
  let NdotV = max(dot(N, V), 1e-3);
  let ramp = waterShoreRamp(length(in.world - cam.eye.xy));
  let depth01 = ramp.x;
  let haze01 = ramp.y;

  // Turbidity: the water body absorbs into deep blue with depth; a soft
  // sun-driven diffuse keeps the near swell readable.
  let body = mix(WATER_SHALLOW_BODY, WATER_DEEP_BODY, depth01);
  let sunTerm = clamp(dot(N, sunDirection()), 0.0, 1.0);
  var col = body * (SKY_AVG * 0.55 + SUN_COLOR * sunTerm * 0.5);

  // Fresnel sky reflection (the sky function carries the sun disc, so the
  // mirror term contributes the long solar track by itself).
  let F = fresnelSchlick(NdotV, WATER_F0);
  let R = reflect(-V, N);
  let refl = skyColor(vec3f(R.xy, abs(R.z)));
  col = mix(col, refl, clamp(F.x * 1.2, 0.0, 1.0));

  // GGX sun specular, roughened slightly by foam.
  let L = sunDirection();
  let H = normalize(V + L);
  let rough = 0.10 + s.foam * 0.25;
  let NdotL = max(dot(N, L), 0.0);
  let spec = dGGX(max(dot(N, H), 0.0), rough) * gSmith(NdotV, NdotL, rough) / max(4.0 * NdotV * NdotL, 1e-3);
  col += SUN_COLOR * spec * NdotL * fresnelSchlick(max(dot(H, V), 0.0), WATER_F0).x * 3.0;

  // Whitecap foam, lit by sun + sky.
  let foam = clamp(s.foam, 0.0, 1.0) * (1.0 - haze01);
  col = mix(col, vec3f(0.92, 0.94, 0.92) * (SUN_COLOR * 0.6 + SKY_AVG * 0.5), foam * 0.5);

  // Aerial perspective: haze toward what the sky pass shows along this exact
  // view ray, so the far sea dissolves into the sky with no seam or edge line.
  col = mix(col, skyColor(vec3f(-V.xy, max(-V.z, 0.002))), haze01);
  return vec4f(displayColor(col), 1.0);
}`.replace('__AGI__', agitation.toFixed(3)), 'bakeoff-water-pbr');
  const pipeline = device.createRenderPipeline({
    label: 'bakeoff-water-pbr-pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
    vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
    fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: gpuReverseZDepthStencil('read-write'),
    multisample: gpuMultisample(shell.sampleCount),
  });

  const sky = new SkyBackgroundPass(shell);
  const sampler = createFrameSampler();
  const fixedT = ctx.params.has('t') ? Number(ctx.params.get('t')) : null;
  const t0 = performance.now();
  const tick = () => {
    const t = fixedT ?? (performance.now() - t0) / 1000;
    shell.setTime(t);
    shell.drawFrame({
      clear: { r: 0.82, g: 0.8, b: 0.7, a: 1 },
      precompute: (enc) => field.ensureFrame(enc, t),
      passes: [
        {
          id: 'water-pbr-plane', role: 'world-opaque', phase: 'world-depth', depth: 'read-write',
          draw: (pass) => {
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, shell.cameraBindGroup);
            const group = field.bindGroup();
            if (group) pass.setBindGroup(1, group);
            pass.setVertexBuffer(0, vertexBuffer);
            pass.setIndexBuffer(indexBuffer, 'uint32');
            pass.drawIndexed(idx.length);
          },
        },
        { id: 'water-pbr-sky', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => sky.draw(pass) },
      ],
    });
    sampler.tick();
    const s = shell.stats();
    publishProbe({
      route: 'water-pbr', substrate: 'bespoke', tech: field.id,
      ...sampler.stats(), gpuTimeMs: s.gpuTimeMs, drawCalls: 2, depth: s.depth,
    });
    ctx.status.innerHTML = `<table><tr><td>route</td><td>water-pbr (bespoke)</td></tr><tr><td>field</td><td>${field.id}</td></tr><tr><td>gpu ms</td><td>${s.gpuTimeMs?.toFixed(3) ?? 'pending'}</td></tr></table>`;
    requestAnimationFrame(tick);
  };
  tick();
}

// ---------------------------------------------------------------------------
// /renderer/crowd-perf — the veto probe. 30,400 VAT-skinned soldiers (two
// formation blocks, per-instance distance LOD through the production tiers,
// CPU frustum cull) + 20k grass tufts (~200k blades) + 3k instanced trees on a
// flat green field, all through the production passes with real: true.

const CROWD_COUNT_DEFAULT = 30400;
const FORMATION_COLUMNS = 190;
const TREE_COUNT = 3000;
const SCATTER = { x0: -450, x1: 450, y0: -150, y1: 900 };

function insideFormation(x: number, y: number): boolean {
  return Math.abs(x) < 115 && (Math.abs(y - 70) < 55 || Math.abs(y + 70) < 55);
}

export async function routeCrowdPerf(ctx: ProbeContext) {
  const presetName = ctx.params.get('cam') === 'vista' ? 'vista' : 'mid';
  const count = Math.max(2, Math.floor(Number(ctx.params.get('count') ?? CROWD_COUNT_DEFAULT)));
  const env = resolveBattleEnvironment('golden-hour');
  const shell = await createFrameShell(ctx.canvas, { enableGpuTimer: true, reverseZ: true });
  const aspect = ctx.canvas.clientWidth && ctx.canvas.clientHeight ? ctx.canvas.clientWidth / ctx.canvas.clientHeight : 1000 / 600;
  const cam3d = camera3dFor(presetName === 'vista' ? BAKEOFF_CAMERAS.crowdVista : BAKEOFF_CAMERAS.crowdMid, aspect);
  applyRealCamera(shell, cam3d);
  shell.setSun(env.environment.sunAzimuth, env.environment.sunElevation);

  // Flat green field covering the vista.
  const grid: BattleTerrainGrid = {
    w: 150, h: 190, cell: 8, ox: -600, oy: -300,
    tint: new Uint8Array(150 * 190),
  };
  const field = terrainHeightField(grid);
  const ground = new BattleGroundPass(shell, env, { real: true });
  ground.setTerrain(grid, field, 'green-grass', 2);

  const grass = new BattleGrassPass(shell, env, { real: true });
  const tufts = Math.max(0, Math.floor(Number(ctx.params.get('tufts') ?? 20000)));
  const bladesPerTuft = 10;
  grass.setField(field, { x: SCATTER.x0, y: SCATTER.y0, width: SCATTER.x1 - SCATTER.x0, height: SCATTER.y1 - SCATTER.y0 }, 'green-grass', {
    density: 50,
    maxTufts: tufts,
    bladesPerTuft,
    bladeHeight: 0.9,
    bladeWidth: 0.07,
    bend: 0.26,
    spread: 0.16,
    windStrength: 0.03,
    zoomT: 1,
  });

  const scenery = new CampaignSceneryPass(shell, 'battle', { real: true });
  const rng = mulberry32(0xba5e0ff);
  const trees: CampaignSceneryInstance[] = [];
  while (trees.length < TREE_COUNT) {
    const x = SCATTER.x0 + rng() * (SCATTER.x1 - SCATTER.x0);
    const y = SCATTER.y0 + rng() * (SCATTER.y1 - SCATTER.y0);
    if (insideFormation(x, y)) continue;
    const conifer = rng() < 0.55;
    trees.push({
      x, y, z: 0,
      size: 2.4 + rng() * 2.6,
      kind: conifer ? 'conifer' : 'broadleaf',
      shade: 0.85 + rng() * 0.3,
      yaw: rng() * Math.PI * 2,
    });
  }
  scenery.upload(trees);

  const vat = await loadPlaceholderVat();
  const tiers = createPlaceholderSoldierMeshTiers([0.2, 0.42, 0.88]);
  const pipeline = new SkinnedCrowdPipeline(shell, tiers, vat, undefined, {
    real: true,
    lighting: skinnedLightingForBattleEnvironment(env),
  });
  const shadows = new SoldierShadowDecalPass(shell, { real: true });

  const half = Math.floor(count / 2);
  const all: CrowdInstance[] = generatedFormation(half, { x: 0, y: -70, faction: 0, columns: FORMATION_COLUMNS, frame: 1 })
    .concat(generatedFormation(count - half, { x: 0, y: 70, faction: 1, columns: FORMATION_COLUMNS, frame: 1 }));

  // Static camera → assign per-instance LOD + frustum visibility once:
  // projected screen height through the real camera picks the production tier,
  // and a clip-space test with margin culls off-frustum soldiers.
  const eye = eyePosition(cam3d);
  const canvasH = ctx.canvas.clientHeight || 600;
  const pxPerWorld = canvasH / (2 * Math.tan(cam3d.fovY / 2));
  let culled = 0;
  const lodCounts = [0, 0, 0, 0];
  const visible: CrowdInstance[] = [];
  for (const inst of all) {
    const { ndc, clipW } = projectPoint(cam3d, [inst.x, inst.y, 0]);
    if (clipW <= 0 || Math.abs(ndc[0]) > 1.15 || Math.abs(ndc[1]) > 1.15) { culled++; continue; }
    const dist = Math.hypot(inst.x - eye[0], inst.y - eye[1], eye[2]);
    const screenSize = (1.8 * pxPerWorld) / Math.max(dist, 1);
    const lod = assignLodForScreenSize(screenSize);
    lodCounts[lod]++;
    visible.push({ ...inst, lod: Math.min(lod, tiers[0].length - 1) });
  }

  const sampler = createFrameSampler();
  const fixedT = ctx.params.has('t') ? Number(ctx.params.get('t')) : null;
  const t0 = performance.now();
  const grassStats = grass.stats();
  const tick = () => {
    const t = fixedT ?? (performance.now() - t0) / 1000;
    shell.setTime(t);
    grass.setWindPhase(t * 0.9);
    pipeline.upload(visible, { forcedClip: 'march', phaseOffset: t * 0.6, size: 1 });
    shadows.upload(visible);
    shell.drawFrame({
      clear: { r: 0.82, g: 0.8, b: 0.7, a: 1 },
      passes: [
        { id: 'crowd-perf-ground', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => ground.draw(pass) },
        { id: 'crowd-perf-grass', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => grass.draw(pass) },
        { id: 'crowd-perf-trees', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => scenery.drawOpaque(pass) },
        { id: 'crowd-perf-crowd', role: 'world-opaque', phase: 'world-depth', depth: 'read-write', draw: (pass) => pipeline.draw(pass) },
        { id: 'crowd-perf-tree-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => scenery.drawShadows(pass) },
        { id: 'crowd-perf-shadows', role: 'world-decal', phase: 'world-depth', depth: 'read', draw: (pass) => shadows.draw(pass) },
      ],
    });
    sampler.tick();
    const s = shell.stats();
    const stats = {
      route: 'crowd-perf',
      substrate: 'bespoke' as const,
      cameraPreset: presetName,
      soldiers: visible.length,
      soldiersTotal: count,
      culled,
      lodCounts,
      trees: trees.length,
      grassBlades: grassStats.bladeInstances,
      grassTufts: grassStats.tuftInstances,
      ...sampler.stats(),
      gpuTimeMs: s.gpuTimeMs,
      drawCalls: pipeline.stats().drawCalls + 4,
      adapterInfo: s.device,
    };
    publishProbe(stats);
    ctx.status.innerHTML = `<table>
      <tr><td>route</td><td>crowd-perf (bespoke)</td></tr>
      <tr><td>camera</td><td>${presetName}</td></tr>
      <tr><td>soldiers</td><td>${visible.length}/${count} (culled ${culled})</td></tr>
      <tr><td>lods</td><td>${lodCounts.join('/')}</td></tr>
      <tr><td>grass blades</td><td>${stats.grassBlades}</td></tr>
      <tr><td>trees</td><td>${trees.length}</td></tr>
      <tr><td>median ms</td><td>${stats.medianMs?.toFixed(2) ?? 'warmup'}</td></tr>
      <tr><td>p95 ms</td><td>${stats.p95Ms?.toFixed(2) ?? 'warmup'}</td></tr>
      <tr><td>gpu ms</td><td>${s.gpuTimeMs?.toFixed(3) ?? 'n/a'}</td></tr>
    </table>`;
    requestAnimationFrame(tick);
  };
  tick();
}
