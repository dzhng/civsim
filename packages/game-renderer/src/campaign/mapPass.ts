import type { CameraSnapshot } from '../../../webgpu-core/src/cameraUniform';
import { worldToScreen } from '../../../webgpu-core/src/cameraUniform';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';
import { webGpuAlphaBlendColorTarget, webGpuWorldDepthStencil } from '../../../webgpu-core/src/pipelineContracts';
import type { BackgroundRenderPass, OverlayRenderPass, RawFrameShell, WorldRenderPass } from '../../../webgpu-core/src/frameShell';

type CampaignLineRenderPass = BackgroundRenderPass | WorldRenderPass;

export interface CampaignMapNodeData {
  name: string;
  pos: [number, number];
  kind: 'city' | 'junction';
  tier: number;
  owner: string;
}

export interface CampaignMapEdgeData {
  kind: 'road' | 'sea';
  via: [number, number][];
}

export interface CampaignMapFactionData {
  id: string;
  color: [number, number, number];
}

export interface CampaignMapInputData {
  map: {
    nodes: CampaignMapNodeData[];
    edges: CampaignMapEdgeData[];
    factions: CampaignMapFactionData[];
  };
}

export interface CampaignMapStats {
  roads: number;
  seaLanes: number;
  lineVertices: number;
  roadMeshVertices: number;
  cityMarkers: number;
  labels: number;
}

export interface CampaignMapStyle {
  seaTintMix?: number;
}

export interface CampaignMapDrawStyle {
  roadScale?: number;
  roadEndpointInset?: number;
}

export interface CampaignMapDrawData {
  lineVertices: Float32Array;
  roadMeshVertices: Float32Array;
  cityMarkers: CampaignMarker[];
  labels: CampaignLabel[];
  stats: CampaignMapStats;
}

export interface CampaignMarker {
  x: number;
  y: number;
  radius: number;
  faction: [number, number, number];
  allegiance: [number, number, number];
  kind?: 'city' | 'army';
  selected?: boolean;
}

export interface CampaignLabel {
  text: string;
  x: number;
  y: number;
  kind: 'city' | 'sea' | 'army' | 'faction';
  size: number;
  priority: number;
  angle?: number;
  curve?: number;
  icon?: 'city' | 'army';
  iconColor?: [number, number, number];
  subText?: string;
  screenOffsetX?: number;
  screenOffsetY?: number;
  factionRadiusKm?: number;
  factionMinor?: boolean;
}

const ICON_PATHS = {
  city: 'M240,208H224V136l2.34,2.34A8,8,0,0,0,237.66,127L139.31,28.68a16,16,0,0,0-22.62,0L18.34,127a8,8,0,0,0,11.32,11.31L32,136v72H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16Zm-88,0H104V160a4,4,0,0,1,4-4h40a4,4,0,0,1,4,4Z',
  army: 'M230.4,219.19A8,8,0,0,1,224,232H32a8,8,0,0,1-6.4-12.8A67.88,67.88,0,0,1,53,197.51a40,40,0,1,1,53.93,0,67.42,67.42,0,0,1,21,14.29,67.42,67.42,0,0,1,21-14.29,40,40,0,1,1,53.93,0A67.85,67.85,0,0,1,230.4,219.19ZM27.2,126.4a8,8,0,0,0,11.2-1.6,52,52,0,0,1,83.2,0,8,8,0,0,0,12.8,0,52,52,0,0,1,83.2,0,8,8,0,0,0,12.8-9.61A67.85,67.85,0,0,0,203,93.51a40,40,0,1,0-53.93,0,67.42,67.42,0,0,0-21,14.29,67.42,67.42,0,0,0-21-14.29,40,40,0,1,0-53.93,0A67.88,67.88,0,0,0,25.6,115.2,8,8,0,0,0,27.2,126.4Z',
} as const;

const MAP_WGSL = `
${WORLD_CAMERA_WGSL}
@group(1) @binding(0) var mapTex: texture_2d<f32>;
@group(1) @binding(1) var mapSampler: sampler;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) world: vec2f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) uv: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectGround(world, 0.65);
  out.uv = uv;
  out.world = world;
  return out;
}

fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}

fn ridged(p: vec2f) -> f32 {
  let r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  return r * r;
}

fn seaAmount(rgb: vec3f) -> f32 {
  return smoothstep(0.04, 0.14, rgb.b - max(rgb.r, rgb.g * 0.88));
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let base = textureSample(mapTex, mapSampler, in.uv).rgb;
  var col = base;
  let grey = dot(col, vec3f(0.333));
  col = mix(vec3f(grey), col, 0.88);
  col *= vec3f(1.04, 1.00, 0.94);
  let seaMask = seaAmount(base);
  col = mix(col, mix(col, vec3f(0.38, 0.58, 0.68), 0.56), seaMask * __SEA_TINT_MIX__);
  let texel = 1.0 / vec2f(textureDimensions(mapTex));
  let seaN = seaAmount(textureSample(mapTex, mapSampler, in.uv + vec2f(0.0, texel.y)).rgb);
  let seaS = seaAmount(textureSample(mapTex, mapSampler, in.uv - vec2f(0.0, texel.y)).rgb);
  let seaE = seaAmount(textureSample(mapTex, mapSampler, in.uv + vec2f(texel.x, 0.0)).rgb);
  let seaW = seaAmount(textureSample(mapTex, mapSampler, in.uv - vec2f(texel.x, 0.0)).rgb);
  let coast = clamp(abs(seaMask - seaN) + abs(seaMask - seaS) + abs(seaMask - seaE) + abs(seaMask - seaW), 0.0, 1.0);
  col = mix(col, vec3f(0.72, 0.76, 0.62), coast * (1.0 - seaMask) * 0.42);
  col = mix(col, vec3f(0.30, 0.48, 0.58), coast * seaMask * 0.20);
  let grain = vnoise(in.world * 0.18) * 0.052 + vnoise(in.world * 0.055 + vec2f(7.1, 2.4)) * 0.038;
  let striation = ridged(vec2f(in.world.x * 0.115 + in.world.y * 0.025, in.world.y * 0.085)) * 0.028;
  col *= 0.95 + grain + striation;
  let vignette = smoothstep(1.28, 0.32, length((in.uv * 2.0 - vec2f(1.0)) * vec2f(1.0, 0.78)));
  col *= 0.90 + 0.10 * vignette;
  return vec4f(col, 1.0);
}`;

const LINE_WGSL = `
${WORLD_CAMERA_WGSL}

struct VsOut { @builtin(position) pos: vec4f, @location(0) color: vec4f };

@vertex
fn vs(@location(0) world: vec2f, @location(1) color: vec4f) -> VsOut {
  var out: VsOut;
  out.pos = projectGround(world, 0.92);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return in.color;
}`;

const ROAD_WGSL = `
${WORLD_CAMERA_WGSL}

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) world: vec3f,
  @location(2) uv: vec2f,
  @location(3) material: f32,
};

@vertex
fn vs(
  @location(0) world: vec3f,
  @location(1) color: vec4f,
  @location(2) uv: vec2f,
  @location(3) material: f32,
) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimCampaignWorldDepth3d(world));
  out.color = color;
  out.world = world;
  out.uv = uv;
  out.material = material;
  return out;
}

fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  if (in.material > 0.5) {
    let paving = hash(floor(in.uv * vec2f(3.8, 2.2)));
    let grit = hash(floor(in.world.xy * vec2f(13.0, 9.0) + vec2f(2.0, 17.0)));
    let centerWear = smoothstep(0.98, 0.08, abs(in.uv.y)) * 0.09;
    let transverseJoint = smoothstep(0.06, 0.0, abs(fract(in.uv.x * 0.78) - 0.5)) * 0.045;
    let edgeDirt = smoothstep(0.42, 1.0, abs(in.uv.y)) * 0.10;
    let light = 0.91 + paving * 0.12 + grit * 0.045 + centerWear - transverseJoint - edgeDirt;
    return vec4f(clamp(in.color.rgb * light, vec3f(0.0), vec3f(1.0)), in.color.a);
  }
  return in.color;
}`;

const MARKER_WGSL = `
${WORLD_CAMERA_WGSL}

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) faction: vec3f,
  @location(2) allegiance: vec3f,
  @location(3) markerKind: f32,
  @location(4) selected: f32,
};

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst0: vec4f, @location(2) inst1: vec4f, @location(3) inst2: vec4f) -> VsOut {
  let markerKind = inst0.w;
  let anchor = projectGround(inst0.xy, 0.08);
  let size = inst0.z;
  let cityOffset = quad * size;
  let flagOffset = vec2f(quad.x * size, (quad.y + 1.0) * size);
  let pixelOffset = mix(cityOffset, flagOffset, markerKind);
  let clipOffset = vec2f(pixelOffset.x / (cam.width * 0.5), pixelOffset.y / (cam.height * 0.5)) * anchor.w;
  var out: VsOut;
  out.pos = vec4f(anchor.x + clipOffset.x, anchor.y + clipOffset.y, anchor.z, anchor.w);
  out.local = quad;
  out.faction = inst1.rgb;
  out.allegiance = vec3f(inst1.a, inst2.r, inst2.g);
  out.markerKind = markerKind;
  out.selected = inst2.b;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let edge = vec3f(0.16, 0.12, 0.07);
  if (in.markerKind < 0.5) {
    let a = max(abs(in.local.x), abs(in.local.y));
    if (a > 1.0) { discard; }
    let border = step(0.72, a);
    let body = mix(in.faction, in.allegiance, 0.18);
    return vec4f(mix(body, edge, border), 0.92);
  }
  let pole = select(0.0, 1.0, abs(in.local.x + 0.55) < 0.08 && in.local.y > -0.96 && in.local.y < 0.94);
  let flagBand = select(0.0, 1.0, in.local.x > -0.55 && in.local.x < 0.82 && in.local.y > 0.05 && in.local.y < 0.92);
  let pennant = flagBand * select(1.0, 0.0, in.local.x > 0.38 && abs(in.local.y - 0.48) < (in.local.x - 0.38) * 0.45);
  let outline = select(0.0, 1.0, in.selected > 0.5 && in.local.x > -0.72 && in.local.x < 0.95 && in.local.y > -0.08 && in.local.y < 1.0);
  let alpha = max(max(pole, pennant), outline * 0.85);
  if (alpha <= 0.0) { discard; }
  let fill = mix(edge, in.faction, pennant);
  let selectedEdge = vec3f(0.96, 0.93, 0.84);
  return vec4f(mix(fill, selectedEdge, outline * (1.0 - pennant) * 0.75), alpha);
}`;

const LABEL_WGSL = `
${WORLD_CAMERA_WGSL}
@group(1) @binding(0) var labelTex: texture_2d<f32>;
@group(1) @binding(1) var labelSampler: sampler;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

fn projectScreen(world: vec2f) -> vec2f {
  let axes = cameraSpace(world);
  let depth = perspectiveDepth(axes.y);
  return vec2f(
    (axes.x * cam.zoom) / depth + cam.width * 0.5,
    (-axes.y * cam.zoom * cam.cosP) / depth + cam.height * 0.5
  );
}

@vertex
fn vs(@location(0) world: vec2f, @location(1) offset: vec2f, @location(2) uv: vec2f) -> VsOut {
  let screen = projectScreen(world) + offset;
  var out: VsOut;
  out.pos = vec4f(
    (screen.x / (cam.width * 0.5)) - 1.0,
    1.0 - (screen.y / (cam.height * 0.5)),
    0.03,
    1.0
  );
  out.uv = uv;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return textureSample(labelTex, labelSampler, in.uv);
}`;

export interface CampaignLabelPassStats {
  labels: number;
  visibleLabels: number;
  atlasWidth: number;
  atlasHeight: number;
  vertices: number;
  layer: 'raw-webgpu-glyph-atlas';
}

export class CampaignMapPass {
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private vertexBuffer: GPUBuffer;

  constructor(private shell: RawFrameShell, image: ImageBitmap, rect: { min: [number, number]; max: [number, number] }, style: CampaignMapStyle = {}) {
    const device = shell.device;
    const module = device.createShaderModule({
      label: 'campaign-map-wgsl',
      code: MAP_WGSL.replace('__SEA_TINT_MIX__', (style.seaTintMix ?? 0).toFixed(3)),
    });
    const texture = device.createTexture({
      label: 'campaign-map-texture',
      size: [image.width, image.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: image }, { texture }, [image.width, image.height]);
    const sampler = device.createSampler({
      label: 'campaign-map-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    const texLayout = device.createBindGroupLayout({
      label: 'campaign-map-texture-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.bindGroup = device.createBindGroup({
      label: 'campaign-map-texture-bg',
      layout: texLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-map-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, texLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
          ],
        }],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format: shell.info.format }] },
      primitive: { topology: 'triangle-strip' },
    });
    const [x0, y0] = rect.min;
    const [x1, y1] = rect.max;
    const vertices = new Float32Array([
      x0, y0, 0, 1,
      x1, y0, 1, 1,
      x0, y1, 0, 0,
      x1, y1, 1, 0,
    ]);
    this.vertexBuffer = device.createBuffer({
      label: 'campaign-map-quad',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: BackgroundRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }
}

export class CampaignLinePass {
  private pipeline: GPURenderPipeline;
  private geometry: CampaignLineGeometry;

  constructor(private shell: RawFrameShell, private topology: GPUPrimitiveTopology = 'line-list') {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-line-wgsl', code: LINE_WGSL });
    this.pipeline = this.makePipeline(module);
    this.geometry = new CampaignLineGeometry(shell, topology, 'campaign-line-empty');
  }

  private makePipeline(module: GPUShaderModule) {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: 'campaign-line-background-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [webGpuAlphaBlendColorTarget(this.shell.info.format)],
      },
      primitive: { topology: this.topology },
    });
  }

  upload(vertices: Float32Array) {
    this.geometry.upload(vertices);
  }

  draw(pass: BackgroundRenderPass) {
    this.geometry.draw(pass, this.pipeline);
  }

  stats() {
    return this.geometry.stats();
  }
}

export class CampaignWorldLinePass {
  private pipeline: GPURenderPipeline;
  private geometry: CampaignLineGeometry;

  constructor(private shell: RawFrameShell, private topology: GPUPrimitiveTopology = 'line-list') {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-world-line-wgsl', code: LINE_WGSL });
    this.pipeline = this.makePipeline(module);
    this.geometry = new CampaignLineGeometry(shell, topology, 'campaign-world-line-empty');
  }

  private makePipeline(module: GPUShaderModule) {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: 'campaign-line-world-depth-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [webGpuAlphaBlendColorTarget(this.shell.info.format)],
      },
      primitive: { topology: this.topology },
      depthStencil: webGpuWorldDepthStencil('read'),
    });
  }

  upload(vertices: Float32Array) {
    this.geometry.upload(vertices);
  }

  draw(pass: WorldRenderPass) {
    this.geometry.draw(pass, this.pipeline);
  }

  stats() {
    return this.geometry.stats();
  }
}

class CampaignLineGeometry {
  private vertexBuffer: GPUBuffer;
  private capacity = 0;
  private vertexCount = 0;

  constructor(private shell: RawFrameShell, private topology: GPUPrimitiveTopology, emptyLabel: string) {
    this.vertexBuffer = shell.device.createBuffer({
      label: emptyLabel,
      size: 6 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / 6);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 512);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: 'campaign-line-vertices',
        size: this.capacity * 6 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (vertices.length > 0) this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: CampaignLineRenderPass, pipeline: GPURenderPipeline) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }

  stats() {
    const segmentDivisor = this.topology === 'line-list' ? 2 : 6;
    return { vertices: this.vertexCount, segments: Math.floor(this.vertexCount / segmentDivisor) };
  }
}

export class CampaignRoadPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private capacity = 0;
  private vertexCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-road-wgsl', code: ROAD_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-road-depth-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 40,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x4' },
            { shaderLocation: 2, offset: 28, format: 'float32x2' },
            { shaderLocation: 3, offset: 36, format: 'float32' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [webGpuAlphaBlendColorTarget(this.shell.info.format)],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: webGpuWorldDepthStencil('read'),
    });
    this.vertexBuffer = device.createBuffer({
      label: 'campaign-road-empty',
      size: 10 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / 10);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 1024);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: 'campaign-road-vertices',
        size: this.capacity * 10 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (vertices.length > 0) this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: WorldRenderPass) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }

  stats() {
    return { vertices: this.vertexCount, triangles: Math.floor(this.vertexCount / 3) };
  }
}

export class CampaignMarkerPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private markerCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-marker-wgsl', code: MARKER_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-marker-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          {
            arrayStride: 48,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x4' },
              { shaderLocation: 3, offset: 32, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: shell.info.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    this.quadBuffer = device.createBuffer({
      label: 'campaign-marker-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({
      label: 'campaign-marker-empty',
      size: 12 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(markers: CampaignMarker[]) {
    this.markerCount = markers.length;
    if (markers.length > this.capacity) {
      this.capacity = Math.max(markers.length, this.capacity * 2, 128);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'campaign-marker-instances',
        size: this.capacity * 12 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (markers.length === 0) return;
    const data = new Float32Array(markers.length * 12);
    const dpr = Math.max(1, this.shell.stats().dpr || 1);
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const o = i * 12;
      data[o] = marker.x;
      data[o + 1] = marker.y;
      data[o + 2] = marker.radius * dpr;
      data[o + 3] = marker.kind === 'army' ? 1 : 0;
      data.set(marker.faction, o + 4);
      data[o + 7] = marker.allegiance[0];
      data[o + 8] = marker.allegiance[1];
      data[o + 9] = marker.allegiance[2];
      data[o + 10] = marker.selected ? 1 : 0;
    }
    this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  draw(pass: OverlayRenderPass) {
    if (this.markerCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(4, this.markerCount);
  }

  stats() {
    return { markers: this.markerCount };
  }
}

export class CampaignLabelPass {
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup: GPUBindGroup;
  private sampler: GPUSampler;
  private texture: GPUTexture;
  private vertexBuffer: GPUBuffer;
  private capacity = 0;
  private vertexCount = 0;
  private atlasKey = '';
  private statsValue: CampaignLabelPassStats = {
    labels: 0,
    visibleLabels: 0,
    atlasWidth: 1,
    atlasHeight: 1,
    vertices: 0,
    layer: 'raw-webgpu-glyph-atlas',
  };

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-label-wgsl', code: LABEL_WGSL });
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'campaign-label-atlas-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.sampler = device.createSampler({
      label: 'campaign-label-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.texture = this.createTexture(1, 1);
    this.bindGroup = this.createBindGroup();
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-label-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
            { shaderLocation: 2, offset: 16, format: 'float32x2' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: shell.info.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.vertexBuffer = device.createBuffer({
      label: 'campaign-label-empty',
      size: 6 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(labels: CampaignLabel[], camera: Omit<CameraSnapshot, 'width' | 'height'>) {
    const stats = this.shell.stats();
    const dpr = Math.max(1, stats.dpr || window.devicePixelRatio || 1);
    const snapshot: CameraSnapshot = { ...camera, width: stats.width, height: stats.height };
    const visible = visibleLabels(labels, snapshot, dpr);
    if (visible.length === 0) {
      this.vertexCount = 0;
      this.atlasKey = `empty:${labels.length}:${dpr}`;
      this.statsValue = { labels: labels.length, visibleLabels: 0, atlasWidth: 1, atlasHeight: 1, vertices: 0, layer: 'raw-webgpu-glyph-atlas' };
      return this.statsValue;
    }

    const atlasKey = labelAtlasKey(visible, dpr, labels.length);
    if (atlasKey === this.atlasKey) return this.statsValue;
    this.atlasKey = atlasKey;
    const atlas = buildLabelAtlas(visible, dpr);
    this.ensureTexture(atlas.width, atlas.height);
    this.shell.device.queue.writeTexture(
      { texture: this.texture },
      atlas.pixels,
      { bytesPerRow: atlas.width * 4, rowsPerImage: atlas.height },
      [atlas.width, atlas.height],
    );
    const vertices = buildLabelVertices(atlas.entries);
    this.vertexCount = Math.floor(vertices.length / 6);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 256);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: 'campaign-label-vertices',
        size: this.capacity * 6 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.shell.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
    this.statsValue = {
      labels: labels.length,
      visibleLabels: visible.length,
      atlasWidth: atlas.width,
      atlasHeight: atlas.height,
      vertices: this.vertexCount,
      layer: 'raw-webgpu-glyph-atlas',
    };
    return this.statsValue;
  }

  draw(pass: OverlayRenderPass) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
  }

  stats() {
    return this.statsValue;
  }

  private ensureTexture(width: number, height: number) {
    if (width === this.statsValue.atlasWidth && height === this.statsValue.atlasHeight) return;
    this.texture = this.createTexture(width, height);
    this.bindGroup = this.createBindGroup();
  }

  private createTexture(width: number, height: number) {
    return this.shell.device.createTexture({
      label: 'campaign-label-atlas',
      size: [width, height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  private createBindGroup() {
    return this.shell.device.createBindGroup({
      label: 'campaign-label-atlas-bg',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: this.texture.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
  }
}

export function buildCampaignMapDrawData(data: CampaignMapInputData, style: CampaignMapDrawStyle = {}): CampaignMapDrawData {
  const roads = data.map.edges.filter((edge) => edge.kind === 'road');
  const seaLanes = data.map.edges.filter((edge) => edge.kind === 'sea');
  const lineVertices: number[] = [];
  const roadMeshVertices: number[] = [];
  for (const edge of data.map.edges) {
    if (edge.kind === 'sea') pushEdgeLines(lineVertices, edge);
    else pushRaisedRoad(roadMeshVertices, edge, style);
  }
  const cityNodes = data.map.nodes.filter((node) => node.kind === 'city');
  const cityMarkers = cityNodes.map((node) => markerForNode(data, node));
  const labels = data.map.nodes.length > 20 ? seaLabels() : [];
  return {
    lineVertices: new Float32Array(lineVertices),
    roadMeshVertices: new Float32Array(roadMeshVertices),
    cityMarkers,
    labels,
    stats: {
      roads: roads.length,
      seaLanes: seaLanes.length,
      lineVertices: Math.floor(lineVertices.length / 6),
      roadMeshVertices: Math.floor(roadMeshVertices.length / 10),
      cityMarkers: cityMarkers.length,
      labels: labels.length,
    },
  };
}

function pushEdgeLines(out: number[], edge: CampaignMapEdgeData) {
  const pushBand = (
    a: [number, number],
    b: [number, number],
    color: [number, number, number, number],
    halfWidth: number,
    offset = 0,
  ) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const ax0 = a[0] + nx * (offset - halfWidth);
    const ay0 = a[1] + ny * (offset - halfWidth);
    const ax1 = a[0] + nx * (offset + halfWidth);
    const ay1 = a[1] + ny * (offset + halfWidth);
    const bx0 = b[0] + nx * (offset - halfWidth);
    const by0 = b[1] + ny * (offset - halfWidth);
    const bx1 = b[0] + nx * (offset + halfWidth);
    const by1 = b[1] + ny * (offset + halfWidth);
    out.push(
      ax0, ay0, ...color,
      bx0, by0, ...color,
      bx1, by1, ...color,
      ax0, ay0, ...color,
      bx1, by1, ...color,
      ax1, ay1, ...color,
    );
  };
  for (let i = 1; i < edge.via.length; i++) {
    const a = edge.via[i - 1];
    const b = edge.via[i];
    pushBand(a, b, [0.58, 0.72, 0.82, 0.075], 0.46);
  }
}

function pushRaisedRoad(out: number[], edge: CampaignMapEdgeData, style: CampaignMapDrawStyle) {
  const roadScale = style.roadScale ?? 1;
  const roadEndpointInset = Math.max(0, style.roadEndpointInset ?? 0);
  const topColor: [number, number, number, number] = [0.78, 0.74, 0.62, 0.92];
  const crownColor: [number, number, number, number] = [0.91, 0.84, 0.66, 0.36];
  const sideColor: [number, number, number, number] = [0.40, 0.32, 0.20, 0.34];
  const shoulderColor: [number, number, number, number] = [0.50, 0.40, 0.24, 0.18];
  const topZ = 0.18 * roadScale;
  const apronZ = 0.07 * roadScale;

  for (let i = 1; i < edge.via.length; i++) {
    const a = edge.via[i - 1];
    const b = edge.via[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const startInset = i === 1 ? roadEndpointInset : 0;
    const endInset = i === edge.via.length - 1 ? roadEndpointInset : 0;
    const usableInset = len > startInset + endInset + 1 ? { start: startInset, end: endInset } : { start: 0, end: 0 };
    const start: [number, number] = [a[0] + ux * usableInset.start, a[1] + uy * usableInset.start];
    const end: [number, number] = [b[0] - ux * usableInset.end, b[1] - uy * usableInset.end];
    const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const topHalf = 1.30 * roadScale;
    const crownHalf = 0.62 * roadScale;
    const shoulderHalf = 2.15 * roadScale;
    if (i === 1) {
      pushRoadDisc(out, start, angle, 3.1 * roadScale, 1.5 * roadScale, apronZ, shoulderColor, 0);
      pushRoadDisc(out, start, angle, 2.15 * roadScale, 1.05 * roadScale, topZ, topColor, 1);
    }
    pushRoadDisc(out, end, angle, 2.85 * roadScale, 1.38 * roadScale, apronZ, shoulderColor, 0);
    pushRoadDisc(out, end, angle, 1.98 * roadScale, 0.96 * roadScale, topZ, topColor, 1);
    pushRoadStrip(out, start, end, shoulderHalf, 0.02 * roadScale, shoulderColor, 0);
    pushRoadStrip(out, start, end, topHalf, topZ, topColor, 1);
    pushRoadStrip(out, start, end, crownHalf, topZ + 0.025 * roadScale, crownColor, 1);
    pushRoadSide(out, start, end, nx, ny, topHalf, topZ, sideColor);
  }
}

function pushRoadVertex(out: number[], point: [number, number], z: number, color: [number, number, number, number], uv: [number, number], material: number) {
  out.push(point[0], point[1], z, ...color, uv[0], uv[1], material);
}

function pushRoadTriangle(
  out: number[],
  a: [number, number, number, number],
  b: [number, number, number, number],
  c: [number, number, number, number],
  color: [number, number, number, number],
  material: number,
) {
  pushRoadVertex(out, [a[0], a[1]], a[2], color, [a[3], -1], material);
  pushRoadVertex(out, [b[0], b[1]], b[2], color, [b[3], 0], material);
  pushRoadVertex(out, [c[0], c[1]], c[2], color, [c[3], 1], material);
}

function pushRoadStrip(out: number[], a: [number, number], b: [number, number], halfWidth: number, z: number, color: [number, number, number, number], material: number) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a0: [number, number, number, number] = [a[0] - nx * halfWidth, a[1] - ny * halfWidth, z, 0];
  const a1: [number, number, number, number] = [a[0] + nx * halfWidth, a[1] + ny * halfWidth, z, 0];
  const b0: [number, number, number, number] = [b[0] - nx * halfWidth, b[1] - ny * halfWidth, z, len * 0.26];
  const b1: [number, number, number, number] = [b[0] + nx * halfWidth, b[1] + ny * halfWidth, z, len * 0.26];
  pushRoadTriangle(out, a0, b0, b1, color, material);
  pushRoadTriangle(out, a0, b1, a1, color, material);
}

function pushRoadSide(out: number[], a: [number, number], b: [number, number], nx: number, ny: number, halfWidth: number, z: number, color: [number, number, number, number]) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const side = (sign: -1 | 1) => {
    const aTop: [number, number, number, number] = [a[0] + nx * halfWidth * sign, a[1] + ny * halfWidth * sign, z, 0];
    const bTop: [number, number, number, number] = [b[0] + nx * halfWidth * sign, b[1] + ny * halfWidth * sign, z, len * 0.26];
    const aBase: [number, number, number, number] = [aTop[0] + nx * 0.20 * sign, aTop[1] + ny * 0.20 * sign, 0.01, 0];
    const bBase: [number, number, number, number] = [bTop[0] + nx * 0.20 * sign, bTop[1] + ny * 0.20 * sign, 0.01, len * 0.26];
    pushRoadTriangle(out, aBase, bBase, bTop, color, 0);
    pushRoadTriangle(out, aBase, bTop, aTop, color, 0);
  };
  side(-1);
  side(1);
}

function pushRoadDisc(out: number[], center: [number, number], angle: number, radiusX: number, radiusY: number, z: number, color: [number, number, number, number], material: number) {
  const steps = 18;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    const p0: [number, number, number, number] = [
      center[0] + Math.cos(a0) * radiusX * cos - Math.sin(a0) * radiusY * sin,
      center[1] + Math.cos(a0) * radiusX * sin + Math.sin(a0) * radiusY * cos,
      z,
      i / 3,
    ];
    const p1: [number, number, number, number] = [
      center[0] + Math.cos(a1) * radiusX * cos - Math.sin(a1) * radiusY * sin,
      center[1] + Math.cos(a1) * radiusX * sin + Math.sin(a1) * radiusY * cos,
      z,
      (i + 1) / 3,
    ];
    const c: [number, number, number, number] = [center[0], center[1], z, i / 3];
    pushRoadTriangle(out, c, p0, p1, color, material);
  }
}

function markerForNode(data: CampaignMapInputData, node: CampaignMapNodeData): CampaignMarker {
  const factionIndex = Math.max(0, data.map.factions.findIndex((faction) => faction.id === node.owner));
  const faction = data.map.factions[factionIndex]?.color ?? [154, 132, 90];
  return {
    x: node.pos[0],
    y: node.pos[1],
    radius: node.tier >= 3 ? 10 : 7,
    faction: [faction[0] / 255, faction[1] / 255, faction[2] / 255],
    allegiance: node.owner === 'rome' ? [0.31, 0.82, 0.39] : [0.93, 0.78, 0.30],
  };
}

function seaLabels(): CampaignLabel[] {
  return [
    { text: 'Mediterranean Sea', x: 320, y: -585, size: 28, kind: 'sea', priority: 4, angle: -0.03, curve: -0.85 },
    { text: 'Tyrrhenian Sea', x: -360, y: 120, size: 20, kind: 'sea', priority: 4, angle: -0.5, curve: 0.55 },
    { text: 'Ionian Sea', x: 30, y: -170, size: 18, kind: 'sea', priority: 4, angle: -0.9, curve: 0.45 },
    { text: 'Adriatic Sea', x: 70, y: 690, size: 18, kind: 'sea', priority: 4, angle: -0.65, curve: -0.4 },
    { text: 'Aegean Sea', x: 600, y: 150, size: 17, kind: 'sea', priority: 4, angle: -0.7, curve: 0.42 },
    { text: 'Black Sea', x: 1080, y: 1180, size: 24, kind: 'sea', priority: 4, curve: 0.5 },
    { text: 'Iberian Sea', x: -1640, y: -40, size: 22, kind: 'sea', priority: 4, curve: -0.45 },
    { text: 'Atlantic Ocean', x: -2200, y: 760, size: 15, kind: 'sea', priority: 4, angle: -1.1, curve: 0.18 },
  ];
}

interface VisibleCampaignLabel {
  label: CampaignLabel;
  screenX: number;
  screenY: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

interface AtlasEntry extends VisibleCampaignLabel {
  width: number;
  height: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

function visibleLabels(labels: CampaignLabel[], camera: CameraSnapshot, dpr: number): VisibleCampaignLabel[] {
  const visible: VisibleCampaignLabel[] = [];
  for (const label of labels) {
    let opacity = 1;
    let resolved = label;
    if (label.kind === 'city') {
      const minTier = camera.zoom < 0.6 ? 3 : camera.zoom < 0.85 ? 2 : 1;
      if (label.priority < minTier) continue;
      const size = Math.min(15, 9.5 + camera.zoom) * (label.priority >= 3 ? 1.15 : 1);
      resolved = { ...label, size };
    } else if (label.kind === 'army') {
      if (camera.zoom <= 0.35) continue;
      const size = Math.min(14, 9 + camera.zoom);
      resolved = { ...label, size };
    } else if (label.kind === 'sea') {
      opacity = (1 - clamp01((camera.zoom - 0.26) / 0.16)) * 0.8;
      if (opacity <= 0.02) continue;
    } else if (label.kind === 'faction') {
      const radius = label.factionRadiusKm ?? 0;
      const screenR = radius * camera.zoom;
      const powerAlpha = 1 - clamp01((camera.zoom - 0.72) / 0.16);
      const leagueHiFade = 1 - clamp01((camera.zoom - 0.85) / 0.18);
      opacity = label.factionMinor
        ? clamp01((screenR - 95) / 45) * leagueHiFade * 0.9
        : powerAlpha;
      if (opacity <= 0.02) continue;
      const size = label.factionMinor
        ? Math.min(22, Math.max(9, screenR * 0.4))
        : Math.min(34, Math.max(17, screenR * 0.5));
      resolved = { ...label, size };
    }
    const [screenX, screenY] = worldToScreen(camera, label.x, label.y);
    if (screenX < -180 || screenY < -80 || screenX > camera.width + 180 || screenY > camera.height + 80) continue;
    visible.push({
      label: resolved,
      screenX,
      screenY,
      offsetX: (label.screenOffsetX ?? 0) * dpr,
      offsetY: (label.screenOffsetY ?? 0) * dpr,
      opacity,
    });
  }
  return visible;
}

function labelAtlasKey(labels: VisibleCampaignLabel[], dpr: number, totalLabels: number) {
  return [
    totalLabels,
    dpr.toFixed(2),
    ...labels.map((entry) => {
      const { label } = entry;
      return [
        label.kind,
        labelText(label),
        label.x.toFixed(2),
        label.y.toFixed(2),
        label.size.toFixed(2),
        label.priority,
        (label.angle ?? 0).toFixed(3),
        (label.curve ?? 0).toFixed(3),
        label.icon ?? 'none',
        label.iconColor?.map((v) => v.toFixed(3)).join(',') ?? '',
        label.subText ?? '',
        entry.offsetX.toFixed(2),
        entry.offsetY.toFixed(2),
        entry.opacity.toFixed(3),
      ].join(':');
    }),
  ].join('|');
}

function buildLabelAtlas(labels: VisibleCampaignLabel[], dpr: number) {
  const measure = document.createElement('canvas').getContext('2d')!;
  const measured = labels.map((entry) => {
    const style = labelStyle(entry.label, dpr);
    measure.font = style.font;
    measure.letterSpacing = style.letterSpacing;
    const text = labelText(entry.label);
    const subText = entry.label.subText ?? '';
    const iconWidth = entry.label.icon ? style.iconSize + style.iconGap : 0;
    const subWidth = subText ? measureTextWithFont(measure, style.subFont, style.letterSpacing, subText) : 0;
    const seaPath = entry.label.kind === 'sea' ? measureSeaLabel(measure, style, entry.label, text) : null;
    return {
      ...entry,
      text,
      subText,
      style,
      seaPath,
      width: Math.max(1, Math.ceil(Math.max(seaPath?.width ?? measure.measureText(text).width + iconWidth, subWidth) + style.padding * 2)),
      height: Math.max(1, Math.ceil((seaPath?.height ?? style.size * (subText ? 2.2 : 1.55)) + style.padding * 2)),
    };
  });
  const atlasWidth = measured.some((entry) => entry.width > 1024) ? 2048 : 1024;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const placements: (typeof measured[number] & { x: number; y: number })[] = [];
  for (const entry of measured) {
    if (x + entry.width > atlasWidth) {
      x = 0;
      y += rowHeight + 2;
      rowHeight = 0;
    }
    placements.push({ ...entry, x, y });
    x += entry.width + 2;
    rowHeight = Math.max(rowHeight, entry.height);
  }
  const atlasHeight = Math.max(32, nextPowerOfTwo(y + rowHeight + 2));
  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const entries: AtlasEntry[] = [];
  for (const entry of placements) {
    ctx.save();
    ctx.font = entry.style.font;
    ctx.letterSpacing = entry.style.letterSpacing;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const iconWidth = entry.label.icon ? entry.style.iconSize + entry.style.iconGap : 0;
    const tx = entry.x + entry.style.padding + iconWidth;
    const ty = entry.y + entry.style.padding + entry.style.size;
    ctx.globalAlpha = entry.opacity;
    if (entry.label.kind === 'sea' && entry.seaPath) {
      drawSeaLabelText(ctx, entry, entry.seaPath);
    } else {
      if (entry.label.icon) drawLabelIcon(ctx, entry.label, entry.x + entry.style.padding, ty - entry.style.iconSize * 0.84, entry.style);
      ctx.lineWidth = entry.style.haloWidth;
      ctx.strokeStyle = entry.style.halo;
      ctx.strokeText(entry.text, tx, ty);
      ctx.fillStyle = entry.style.fill;
      ctx.fillText(entry.text, tx, ty);
    }
    if (entry.subText) {
      ctx.font = entry.style.subFont;
      const subWidth = ctx.measureText(entry.subText).width;
      const sx = entry.x + entry.width * 0.5 - subWidth * 0.5;
      const sy = ty + entry.style.size * 0.92;
      ctx.lineWidth = entry.style.subHaloWidth;
      ctx.strokeStyle = entry.style.halo;
      ctx.strokeText(entry.subText, sx, sy);
      ctx.fillStyle = entry.style.subFill;
      ctx.fillText(entry.subText, sx, sy);
    }
    ctx.restore();
    entries.push({
      label: entry.label,
      screenX: entry.screenX,
      screenY: entry.screenY,
      offsetX: entry.offsetX,
      offsetY: entry.offsetY,
      opacity: entry.opacity,
      width: entry.width,
      height: entry.height,
      u0: entry.x / atlasWidth,
      v0: entry.y / atlasHeight,
      u1: (entry.x + entry.width) / atlasWidth,
      v1: (entry.y + entry.height) / atlasHeight,
    });
  }
  return { width: atlasWidth, height: atlasHeight, pixels: ctx.getImageData(0, 0, atlasWidth, atlasHeight).data, entries };
}

function buildLabelVertices(entries: AtlasEntry[]) {
  const vertices = new Float32Array(entries.length * 6 * 6);
  let o = 0;
  for (const entry of entries) {
    const label = entry.label;
    const width = entry.width;
    const height = entry.height;
    const angle = label.angle ?? 0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const corners = [
      [-width * 0.5, -height * 0.5, entry.u0, entry.v0],
      [width * 0.5, -height * 0.5, entry.u1, entry.v0],
      [-width * 0.5, height * 0.5, entry.u0, entry.v1],
      [width * 0.5, -height * 0.5, entry.u1, entry.v0],
      [width * 0.5, height * 0.5, entry.u1, entry.v1],
      [-width * 0.5, height * 0.5, entry.u0, entry.v1],
    ];
    for (const corner of corners) {
      const [x, y, u, v] = corner;
      const ox = x * c - y * s;
      const oy = x * s + y * c;
      vertices[o++] = label.x;
      vertices[o++] = label.y;
      vertices[o++] = ox + entry.offsetX;
      vertices[o++] = oy + entry.offsetY;
      vertices[o++] = u;
      vertices[o++] = v;
    }
  }
  return vertices;
}

function labelText(label: CampaignLabel) {
  return label.kind === 'faction' || label.kind === 'sea' ? label.text.toUpperCase() : label.text;
}

function labelStyle(label: CampaignLabel, dpr: number) {
  const size = Math.max(10, label.size) * dpr;
  if (label.kind === 'sea') {
    return {
      font: `italic 400 ${size}px Georgia, 'Times New Roman', serif`,
      letterSpacing: `${size * 0.22}px`,
      size,
      padding: Math.ceil(size * 0.34),
      fill: 'rgba(196, 214, 232, 0.78)',
      halo: 'rgba(20, 34, 52, 0.55)',
      haloWidth: 2.5 * dpr,
      iconSize: 0,
      iconGap: 0,
      iconHaloWidth: 0,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: 'rgba(232,224,208,0.92)',
      subHaloWidth: 2 * dpr,
    };
  }
  if (label.kind === 'army') {
    return {
      font: `600 ${size}px Cinzel, Georgia, 'Times New Roman', serif`,
      letterSpacing: `${0.5 * dpr}px`,
      size,
      padding: Math.ceil(size * 0.42),
      fill: 'rgba(248,244,237,0.98)',
      halo: 'rgba(14,10,7,0.88)',
      haloWidth: 3.1 * dpr,
      iconSize: size * 1.25,
      iconGap: size * 0.32,
      iconHaloWidth: 30,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: 'rgba(248,244,237,0.96)',
      subHaloWidth: 2.7 * dpr,
    };
  }
  if (label.kind === 'faction') {
    return {
      font: `700 ${size}px Cinzel, Georgia, 'Times New Roman', serif`,
      letterSpacing: `${Math.max(0.5 * dpr, size * 0.07)}px`,
      size,
      padding: Math.ceil(size * 0.44),
      fill: 'rgba(250,248,243,0.98)',
      halo: 'rgba(10,8,5,0.9)',
      haloWidth: Math.max(2.5 * dpr, size / 6),
      iconSize: 0,
      iconGap: 0,
      iconHaloWidth: 0,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: 'rgba(232,224,208,0.92)',
      subHaloWidth: 2 * dpr,
    };
  }
  return {
    font: `600 ${size}px Cinzel, Georgia, 'Times New Roman', serif`,
    letterSpacing: `${0.5 * dpr}px`,
    size,
    padding: Math.ceil(size * 0.42),
    fill: 'rgba(248,244,237,0.98)',
    halo: 'rgba(14,10,7,0.88)',
    haloWidth: 3.1 * dpr,
    iconSize: size * 1.25,
    iconGap: size * 0.32,
    iconHaloWidth: 30,
    subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
    subFill: 'rgba(248,244,237,0.96)',
    subHaloWidth: 2.7 * dpr,
  };
}

interface SeaLabelGlyph {
  char: string;
  width: number;
  center: number;
}

interface SeaLabelPath {
  glyphs: SeaLabelGlyph[];
  width: number;
  height: number;
  depth: number;
}

function measureSeaLabel(
  ctx: CanvasRenderingContext2D,
  style: ReturnType<typeof labelStyle>,
  label: CampaignLabel,
  text: string,
): SeaLabelPath {
  const previousLetterSpacing = ctx.letterSpacing;
  ctx.letterSpacing = '0px';
  const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
  const chars = Array.from(text);
  const widths = chars.map((char) => ctx.measureText(char).width);
  const width = Math.max(1, widths.reduce((sum, value) => sum + value, 0) + Math.max(0, chars.length - 1) * letterSpacing);
  const bend = label.curve ?? defaultSeaLabelCurve(label);
  const depth = bend * Math.min(style.size * 1.35, Math.max(style.size * 0.42, width * 0.075));
  let advance = 0;
  const glyphs = chars.map((char, index) => {
    const glyphWidth = widths[index];
    const center = advance + glyphWidth * 0.5;
    advance += glyphWidth + letterSpacing;
    return { char, width: glyphWidth, center };
  });
  ctx.letterSpacing = previousLetterSpacing;
  return {
    glyphs,
    width,
    height: style.size * 1.5 + Math.abs(depth) * 1.35,
    depth,
  };
}

function drawSeaLabelText(
  ctx: CanvasRenderingContext2D,
  entry: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: CampaignLabel;
    style: ReturnType<typeof labelStyle>;
  },
  path: SeaLabelPath,
) {
  ctx.letterSpacing = '0px';
  ctx.lineWidth = entry.style.haloWidth;
  ctx.strokeStyle = entry.style.halo;
  ctx.fillStyle = entry.style.fill;
  const centerX = entry.x + entry.width * 0.5;
  const baselineY = entry.y + entry.height * 0.5 + entry.style.size * 0.31;
  const startX = centerX - path.width * 0.5;
  const halfWidth = Math.max(1, path.width * 0.5);
  for (const glyph of path.glyphs) {
    const t = (glyph.center - halfWidth) / halfWidth;
    const y = path.depth * (1 - t * t);
    const tangent = Math.atan((-2 * path.depth * t) / halfWidth);
    ctx.save();
    ctx.translate(startX + glyph.center, baselineY + y);
    ctx.rotate(tangent);
    ctx.strokeText(glyph.char, -glyph.width * 0.5, 0);
    ctx.fillText(glyph.char, -glyph.width * 0.5, 0);
    ctx.restore();
  }
}

function defaultSeaLabelCurve(label: CampaignLabel) {
  return label.text.length > 14 ? -0.55 : 0.4;
}

function drawLabelIcon(
  ctx: CanvasRenderingContext2D,
  label: CampaignLabel,
  x: number,
  y: number,
  style: ReturnType<typeof labelStyle>,
) {
  if (!label.icon) return;
  const path = new Path2D(ICON_PATHS[label.icon]);
  const s = style.iconSize / 256;
  const color = label.iconColor ?? (label.kind === 'army' ? [0.31, 0.82, 0.39] : [0.93, 0.78, 0.30]);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = style.iconHaloWidth;
  ctx.strokeStyle = style.halo;
  ctx.stroke(path);
  ctx.fillStyle = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
  ctx.fill(path);
  ctx.restore();
}

function nextPowerOfTwo(value: number) {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function measureTextWithFont(ctx: CanvasRenderingContext2D, font: string, letterSpacing: string, text: string) {
  const prevFont = ctx.font;
  const prevLetterSpacing = ctx.letterSpacing;
  ctx.font = font;
  ctx.letterSpacing = letterSpacing;
  const width = ctx.measureText(text).width;
  ctx.font = prevFont;
  ctx.letterSpacing = prevLetterSpacing;
  return width;
}
