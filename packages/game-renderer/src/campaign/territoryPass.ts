import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';

export interface CampaignTerritoryTextureData {
  width: number;
  height: number;
  rgba: Uint8Array;
  rect: { min: [number, number]; max: [number, number] };
}

export interface CampaignBorderPolyline {
  pts: [number, number][];
}

export interface CampaignTerritoryStyle {
  alpha?: number;
  warmMix?: number;
}

const TERRITORY_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32, perspective:f32, pad0:f32, pad1:f32, pad2:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;
@group(1) @binding(0) var terrTex: texture_2d<f32>;
@group(1) @binding(1) var terrSampler: sampler;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

fn projectWorld(world: vec2f, z: f32) -> vec4f {
  let dx = world.x - cam.x;
  let dy = world.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  let depth = max(0.32, 1.0 + ry * cam.perspective);
  return vec4f((rx * cam.zoom) / (cam.width * 0.5), (ry * cam.zoom * cam.cosP) / (cam.height * 0.5), z * depth, depth);
}

@vertex
fn vs(@location(0) world: vec2f, @location(1) uv: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(world, 0.42);
  out.uv = uv;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let sample = textureSample(terrTex, terrSampler, in.uv);
  let color = mix(sample.rgb, vec3f(0.92, 0.74, 0.42), __TERRITORY_WARM_MIX__);
  return vec4f(color, sample.a * __TERRITORY_ALPHA__);
}`;

export class CampaignTerritoryPass {
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private vertexBuffer: GPUBuffer;
  private sampler: GPUSampler;
  private texture: GPUTexture | null = null;
  private textureSize = { width: 0, height: 0 };

  constructor(private shell: RawFrameShell, data: CampaignTerritoryTextureData, style: CampaignTerritoryStyle = {}) {
    const device = shell.device;
    const module = device.createShaderModule({
      label: 'campaign-territory-wgsl',
      code: TERRITORY_WGSL
        .replace('__TERRITORY_WARM_MIX__', (style.warmMix ?? 0.04).toFixed(3))
        .replace('__TERRITORY_ALPHA__', (style.alpha ?? 0.24).toFixed(3)),
    });
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'campaign-territory-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-territory-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, this.bindGroupLayout] }),
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
    this.vertexBuffer = device.createBuffer({
      label: 'campaign-territory-quad',
      size: 16 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.sampler = device.createSampler({
      label: 'campaign-territory-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.upload(data);
  }

  upload(data: CampaignTerritoryTextureData) {
    const device = this.shell.device;
    if (!this.texture || this.textureSize.width !== data.width || this.textureSize.height !== data.height) {
      this.texture?.destroy();
      this.texture = this.createTexture(data.width, data.height);
      this.textureSize = { width: data.width, height: data.height };
      this.bindGroup = device.createBindGroup({
        label: 'campaign-territory-bg',
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: this.texture.createView() },
          { binding: 1, resource: this.sampler },
        ],
      });
    }
    const bytesPerRow = align256(data.width * 4);
    const source = bytesPerRow === data.width * 4 ? data.rgba : padRows(data.rgba, data.width, data.height, bytesPerRow);
    device.queue.writeTexture(
      { texture: this.texture },
      source,
      { bytesPerRow, rowsPerImage: data.height },
      { width: data.width, height: data.height },
    );
    const [x0, y0] = data.rect.min;
    const [x1, y1] = data.rect.max;
    device.queue.writeBuffer(this.vertexBuffer, 0, new Float32Array([
      x0, y0, 0, 1,
      x1, y0, 1, 1,
      x0, y1, 0, 0,
      x1, y1, 1, 0,
    ]));
  }

  draw(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }

  stats() {
    return { width: this.textureSize.width, height: this.textureSize.height, pixels: this.textureSize.width * this.textureSize.height };
  }

  private createTexture(width: number, height: number) {
    return this.shell.device.createTexture({
      label: 'campaign-territory-texture',
      size: [width, height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }
}

export function campaignBorderVertices(
  borders: CampaignBorderPolyline[],
  color: [number, number, number, number] = [0.19, 0.12, 0.07, 0.74],
): Float32Array {
  const out: number[] = [];
  for (const border of borders) {
    for (let i = 1; i < border.pts.length; i++) {
      const a = border.pts[i - 1];
      const b = border.pts[i];
      out.push(a[0], a[1], ...color, b[0], b[1], ...color);
    }
  }
  return new Float32Array(out);
}

function align256(value: number) {
  return Math.ceil(value / 256) * 256;
}

function padRows(rgba: Uint8Array, width: number, height: number, bytesPerRow: number) {
  const rowBytes = width * 4;
  const padded = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    padded.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * bytesPerRow);
  }
  return padded;
}
