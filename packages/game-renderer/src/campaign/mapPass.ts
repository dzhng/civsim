import { CAMPAIGN_MARKER_COLOR_WGSL, type CampaignMarker } from './marker';
import type { CameraSnapshot } from '@packages/renderer-core/src/cameraUniform';
import { WORLD_CAMERA_WGSL } from '@packages/renderer-core/src/cameraWgsl';
import type { BackgroundRenderPass, OverlayRenderPass, RawFrameShell, WorldRenderPass } from '@packages/renderer-core/src/frameShell';
import { GrowableBuffer, makeVertexBuffer } from '@packages/renderer-core/src/gpuBuffers';
import { NOISE_WGSL } from '@packages/renderer-core/src/noiseWgsl';
import { cameraOnlyPipeline } from '@packages/renderer-core/src/pipelineContracts';
import { CampaignLabelFrame, type CampaignLabel, type CampaignLabelFrameStats } from './labelFrame';
import { buildLabelVertices, type CampaignLabelPlacementStyle } from './labelLayout';


type CampaignLineRenderPass = BackgroundRenderPass | WorldRenderPass;



const LINE_WGSL = `
${WORLD_CAMERA_WGSL}

struct VsOut { @builtin(position) pos: vec4f, @location(0) color: vec4f };

@vertex
fn vs(@location(0) world: vec2f, @location(1) color: vec4f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, 0.0));
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return in.color;
}`;

// 3D variant: vertices carry their own z (terrain height + lift) so ground
// strips like the faction borders drape over raised terrain instead of being
// depth-buried at z = 0 under the height-mapped surface mesh.
const LINE3D_WGSL = `
${WORLD_CAMERA_WGSL}

struct VsOut { @builtin(position) pos: vec4f, @location(0) color: vec4f };

@vertex
fn vs(@location(0) world: vec3f, @location(1) color: vec4f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(world);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return in.color;
}`;

const ROAD_WGSL = `
${WORLD_CAMERA_WGSL}
${NOISE_WGSL}

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
  out.pos = projectWorld(world);
  out.color = color;
  out.world = world;
  out.uv = uv;
  out.material = material;
  return out;
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
${CAMPAIGN_MARKER_COLOR_WGSL}

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
  let anchor = projectWorld(vec3f(inst0.xy, 0.0));
  let size = inst0.z;
  let cityOffset = quad * size;
  let flagOffset = vec2f(quad.x * size, (quad.y + 1.0) * size);
  let pixelOffset = mix(cityOffset, flagOffset, markerKind);
  let clipOffset = vec2f(pixelOffset.x / (cam.width * 0.5), pixelOffset.y / (cam.height * 0.5)) * anchor.w;
  var out: VsOut;
  out.pos = vec4f(anchor.x + clipOffset.x, anchor.y + clipOffset.y, anchor.z, anchor.w);
  // Screen y is up (+clip.y = top), but the marker art is authored y-down, so
  // flip the fragment's local y — otherwise the standard flies upside down.
  out.local = vec2f(quad.x, -quad.y);
  out.faction = inst1.rgb;
  out.allegiance = vec3f(inst1.a, inst2.r, inst2.g);
  out.markerKind = markerKind;
  out.selected = inst2.b;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  if (in.markerKind < 0.5) { discard; }
  return campaignMarkerColor(in.local, in.faction, in.selected);
}`;

// The label anchor projection: the real camera3d projection (projectWorld →
// NDC → device pixels), returned in device-pixel screen space (y-down); the
// CPU visibility cull (visibleLabels) uses the matching
// cameraUniform.worldToScreen so atlas placement and the GPU agree.
const labelWgsl = `
${WORLD_CAMERA_WGSL}
@group(1) @binding(0) var labelTex: texture_2d<f32>;
@group(1) @binding(1) var labelSampler: sampler;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

fn projectScreen(world: vec2f) -> vec2f {
  let clip = projectWorld(vec3f(world, 0.0));
  let ndc = clip.xy / clip.w;
  return vec2f((ndc.x * 0.5 + 0.5) * cam.width, (1.0 - (ndc.y * 0.5 + 0.5)) * cam.height);
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

export type CampaignLabelPassStats = CampaignLabelFrameStats & { layer: 'raw-gpu-glyph-atlas' };

export class CampaignWorldLinePass {
  private pipeline: GPURenderPipeline;
  private geometry: CampaignLineGeometry;

  constructor(
    private shell: RawFrameShell,
    private topology: GPUPrimitiveTopology = 'line-list',
    private vertexFormat: 'xy' | 'xyz' = 'xy',
  ) {
    const device = shell.device;
    const module = device.createShaderModule({
      label: 'campaign-world-line-wgsl',
      code: vertexFormat === 'xyz' ? LINE3D_WGSL : LINE_WGSL,
    });
    this.pipeline = this.makePipeline(module);
    this.geometry = new CampaignLineGeometry(
      shell,
      topology,
      'campaign-world-line-empty',
      vertexFormat === 'xyz' ? 7 : 6,
    );
  }

  private makePipeline(module: GPUShaderModule) {
    const positionSize = this.vertexFormat === 'xyz' ? 12 : 8;
    return cameraOnlyPipeline(this.shell, {
      label: 'campaign-line-world-depth-pipeline',
      module,
      buffers: [{
          arrayStride: positionSize + 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: this.vertexFormat === 'xyz' ? 'float32x3' : 'float32x2' },
            { shaderLocation: 1, offset: positionSize, format: 'float32x4' },
          ],
      }],
      target: 'alpha',
      depth: 'read',
      topology: this.topology,
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
  private vertexBuffer: GrowableBuffer;
  private vertexCount = 0;

  constructor(
    private shell: RawFrameShell,
    private topology: GPUPrimitiveTopology,
    emptyLabel: string,
    private floatsPerVertex = 6,
  ) {
    this.vertexBuffer = new GrowableBuffer(shell.device, emptyLabel, GPUBufferUsage.VERTEX, 512 * this.floatsPerVertex * 4);
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / this.floatsPerVertex);
    this.vertexBuffer.write(vertices);
  }

  draw(pass: CampaignLineRenderPass, pipeline: GPURenderPipeline) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer.buffer);
    pass.draw(this.vertexCount);
  }

  stats() {
    const segmentDivisor = this.topology === 'line-list' ? 2 : 6;
    return { vertices: this.vertexCount, segments: Math.floor(this.vertexCount / segmentDivisor) };
  }
}

export class CampaignRoadPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GrowableBuffer;
  private vertexCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-road-wgsl', code: ROAD_WGSL });
    this.pipeline = cameraOnlyPipeline(shell, {
      label: 'campaign-road-depth-pipeline',
      module,
      buffers: [{
          arrayStride: 40,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x4' },
            { shaderLocation: 2, offset: 28, format: 'float32x2' },
            { shaderLocation: 3, offset: 36, format: 'float32' },
          ],
      }],
      target: 'alpha',
      depth: 'read',
    });
    this.vertexBuffer = new GrowableBuffer(device, 'campaign-road-vertices', GPUBufferUsage.VERTEX, 1024 * 10 * 4);
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / 10);
    this.vertexBuffer.write(vertices);
  }

  draw(pass: WorldRenderPass) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer.buffer);
    pass.draw(this.vertexCount);
  }

  stats() {
    return { vertices: this.vertexCount, triangles: Math.floor(this.vertexCount / 3) };
  }
}

export class CampaignMarkerPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GrowableBuffer;
  private markerCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-marker-wgsl', code: MARKER_WGSL });
    this.pipeline = cameraOnlyPipeline(shell, {
      label: 'campaign-marker-pipeline',
      module,
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
      target: 'alpha',
      depth: null,
      topology: 'triangle-strip',
    });
    this.quadBuffer = makeVertexBuffer(device, 'campaign-marker-quad', new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = new GrowableBuffer(device, 'campaign-marker-instances', GPUBufferUsage.VERTEX, 128 * 12 * 4);
  }

  upload(markers: CampaignMarker[]) {
    this.markerCount = markers.length;
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
    this.instanceBuffer.write(data);
  }

  draw(pass: OverlayRenderPass) {
    if (this.markerCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer.buffer);
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
  private vertexBuffer: GrowableBuffer;
  private vertexCount = 0;
  private readonly frame = new CampaignLabelFrame();

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-label-wgsl', code: labelWgsl });
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
    this.pipeline = cameraOnlyPipeline(shell, {
      label: 'campaign-label-pipeline',
      module,
      buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
            { shaderLocation: 2, offset: 16, format: 'float32x2' },
          ],
      }],
      target: 'alpha',
      depth: null,
      extraBindGroupLayouts: [this.bindGroupLayout],
    });
    this.vertexBuffer = new GrowableBuffer(device, 'campaign-label-vertices', GPUBufferUsage.VERTEX, 256 * 6 * 4);
  }

  upload(
    labels: CampaignLabel[],
    camera: Omit<CameraSnapshot, 'width' | 'height'>,
    placement?: CampaignLabelPlacementStyle,
  ) {
    const stats = this.shell.stats();
    const dpr = Math.max(1, stats.dpr || window.devicePixelRatio || 1);
    const snapshot: CameraSnapshot = { ...camera, width: stats.width, height: stats.height };
    const previous = this.frame.atlas;
    this.frame.update(labels, snapshot, dpr, placement);
    this.vertexCount = this.frame.vertices.length / 6;
    const atlas = this.frame.atlas;
    if (atlas && atlas !== previous) {
      this.ensureTexture(atlas.width, atlas.height);
      this.shell.device.queue.writeTexture({ texture: this.texture }, atlas.pixels,
        { bytesPerRow: atlas.width * 4, rowsPerImage: atlas.height }, [atlas.width, atlas.height]);
      this.vertexBuffer.write(buildLabelVertices(atlas.entries));
    }
    return this.stats();
  }

  draw(pass: OverlayRenderPass) {
    if (this.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer.buffer);
    pass.draw(this.vertexCount);
  }

  stats() {
    return { ...this.frame.stats(), layer: 'raw-gpu-glyph-atlas' as const };
  }

  private ensureTexture(width: number, height: number) {
    if (width === this.texture.width && height === this.texture.height) return;
    this.texture.destroy();
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
