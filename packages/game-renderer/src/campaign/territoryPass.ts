import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { CAMPAIGN_SEA_PALETTE_WGSL } from '../water/waterPalette';
import type { CampaignDrawnCoast, CampaignMapSurfaceMesh } from './mapPass';

export interface CampaignTerritoryTextureData {
  width: number;
  height: number;
  rgba: Uint8Array;
  rect: { min: [number, number]; max: [number, number] };
}

export interface CampaignBorderPolyline {
  pts: [number, number][];
  bb?: [number, number, number, number];
  left?: CampaignBorderSide | null;
  right?: CampaignBorderSide | null;
}

export interface CampaignTerritoryStyle {
  alpha?: number;
}

export interface CampaignBorderSide {
  owner: number;
  color: [number, number, number];
}

export const CAMPAIGN_FACTION_BORDER_TOTAL_WIDTH_KM = 4.1;
const CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM = 0.7;
const CAMPAIGN_FACTION_BORDER_STRIP_WIDTH_KM =
  (CAMPAIGN_FACTION_BORDER_TOTAL_WIDTH_KM - CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM) * 0.5;
const CAMPAIGN_FACTION_BORDER_ALPHA = 0.94;
const CAMPAIGN_FACTION_BORDER_SEAM: [number, number, number, number] = [0.11, 0.07, 0.04, 0.76];

const TERRITORY_WGSL = `
${WORLD_CAMERA_WGSL}
${CAMPAIGN_SEA_PALETTE_WGSL}
@group(1) @binding(0) var terrTex: texture_2d<f32>;
@group(1) @binding(1) var terrSampler: sampler;
@group(1) @binding(2) var bgTex: texture_2d<f32>;
@group(1) @binding(3) var coastSampler: sampler;
@group(1) @binding(4) var biomeTex: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@location(0) world: vec3f, @location(1) uv: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(world);
  out.uv = uv;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let sample = textureSample(terrTex, terrSampler, in.uv);
  // The wash ends where the DRAWN sea begins: the same textures, shared
  // classifiers (seaAmount / drawnWaterAmount), and terrain mix the map pass
  // composites the visible waterline from — so the wash conforms to the coast
  // the player actually sees at render resolution. Inland texels sample pure
  // land (sea = 0), so faction-vs-faction edges keep their crisp
  // nearest-texel character.
  let seaBg = seaAmount(textureSample(bgTex, coastSampler, in.uv).rgb);
  let seaDrawn = drawnWaterAmount(textureSample(biomeTex, coastSampler, in.uv).a);
  let sea = mix(seaBg, seaDrawn, __TERRAIN_MIX__);
  return vec4f(sample.rgb, sample.a * (1.0 - sea) * __TERRITORY_ALPHA__);
}`;

export class CampaignTerritoryPass {
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private vertexBuffer: GPUBuffer;
  private indexBuffer: GPUBuffer;
  private indexCount: number;
  private sampler: GPUSampler;
  private texture: GPUTexture | null = null;
  private textureSize = { width: 0, height: 0 };
  private surface: CampaignMapSurfaceMesh | null = null;
  private coastSampler: GPUSampler;

  constructor(private shell: RawFrameShell, data: CampaignTerritoryTextureData, private coast: CampaignDrawnCoast, style: CampaignTerritoryStyle = {}, surface?: CampaignMapSurfaceMesh) {
    const device = shell.device;
    this.surface = surface ?? null;
    const mesh = surface ?? flatTerritorySurface(data.rect);
    this.indexCount = mesh.indices.length;
    const module = device.createShaderModule({
      label: 'campaign-territory-wgsl',
      code: TERRITORY_WGSL
        .replace('__TERRITORY_ALPHA__', (style.alpha ?? 0.14).toFixed(3))
        .replace('__TERRAIN_MIX__', coast.terrainMix.toFixed(3)),
    });
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'campaign-territory-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-territory-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 20,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x2' },
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
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read'),
    });
    this.vertexBuffer = device.createBuffer({
      label: 'campaign-territory-surface-vertices',
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.indexBuffer = device.createBuffer({
      label: 'campaign-territory-surface-indices',
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, mesh.vertices);
    device.queue.writeBuffer(this.indexBuffer, 0, mesh.indices);
    this.sampler = device.createSampler({
      label: 'campaign-territory-sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    // Linear like campaign-map-sampler, so the coast classifiers see the same
    // filtered pixels the map pass draws (the nearest territory sampler above
    // is untouched — the crisp inland edge contract).
    this.coastSampler = device.createSampler({
      label: 'campaign-territory-coast-sampler',
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
          { binding: 2, resource: this.coast.bg },
          { binding: 3, resource: this.coastSampler },
          { binding: 4, resource: this.coast.biome },
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
    if (!this.surface) {
      const mesh = flatTerritorySurface(data.rect);
      this.indexCount = mesh.indices.length;
      device.queue.writeBuffer(this.vertexBuffer, 0, mesh.vertices);
      device.queue.writeBuffer(this.indexBuffer, 0, mesh.indices);
    }
  }

  draw(pass: WorldRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.indexCount);
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

function flatTerritorySurface(rect: { min: [number, number]; max: [number, number] }): CampaignMapSurfaceMesh {
  const [x0, y0] = rect.min;
  const [x1, y1] = rect.max;
  return {
    vertices: new Float32Array([
      x0, y0, 0, 0, 1,
      x1, y0, 0, 1, 1,
      x0, y1, 0, 0, 0,
      x1, y1, 0, 1, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
  };
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

// Border strips drape on the terrain: each vertex carries z = heightAt + a small
// lift so the strips ride the height-mapped surface (the wash drapes via the
// surface mesh; a flat z=0 strip would be depth-buried under raised land).
const CAMPAIGN_FACTION_BORDER_LIFT_KM = 0.12;

export function campaignFactionBorderVertices(
  borders: CampaignBorderPolyline[],
  heightAt: (x: number, y: number) => number = () => 0,
): Float32Array {
  const out: number[] = [];
  for (const border of borders) {
    const pts = border.pts;
    if (pts.length < 2) continue;
    pushPolylineStrip(
      out,
      pts,
      -CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5,
      CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5,
      CAMPAIGN_FACTION_BORDER_SEAM,
      heightAt,
    );
    if (border.left) {
      pushPolylineStrip(
        out,
        pts,
        CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5,
        CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5 + CAMPAIGN_FACTION_BORDER_STRIP_WIDTH_KM,
        factionColor(border.left),
        heightAt,
      );
    }
    if (border.right) {
      pushPolylineStrip(
        out,
        pts,
        -CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5,
        -CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5 - CAMPAIGN_FACTION_BORDER_STRIP_WIDTH_KM,
        factionColor(border.right),
        heightAt,
      );
    }
  }
  return new Float32Array(out);
}

function factionColor(side: CampaignBorderSide): [number, number, number, number] {
  return [side.color[0] / 255, side.color[1] / 255, side.color[2] / 255, CAMPAIGN_FACTION_BORDER_ALPHA];
}

function pushPolylineStrip(
  out: number[],
  pts: [number, number][],
  offset0: number,
  offset1: number,
  color: [number, number, number, number],
  heightAt: (x: number, y: number) => number = () => 0,
) {
  const normals: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    normals.push(len > 0.0001 ? [-dy / len, dx / len] : [0, 0]);
  }
  const side0: [number, number][] = [];
  const side1: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = normals[Math.max(0, i - 1)];
    const next = normals[Math.min(normals.length - 1, i)];
    let nx = prev[0] + next[0];
    let ny = prev[1] + next[1];
    const len = Math.hypot(nx, ny);
    if (len > 0.0001) {
      nx /= len;
      ny /= len;
    } else {
      nx = next[0];
      ny = next[1];
    }
    const dot = Math.max(0.42, nx * next[0] + ny * next[1]);
    const p = pts[i];
    side0.push([p[0] + (nx * offset0) / dot, p[1] + (ny * offset0) / dot]);
    side1.push([p[0] + (nx * offset1) / dot, p[1] + (ny * offset1) / dot]);
  }
  for (let i = 1; i < pts.length; i++) {
    pushVertex(out, side0[i - 1], color, heightAt);
    pushVertex(out, side0[i], color, heightAt);
    pushVertex(out, side1[i - 1], color, heightAt);
    pushVertex(out, side1[i - 1], color, heightAt);
    pushVertex(out, side0[i], color, heightAt);
    pushVertex(out, side1[i], color, heightAt);
  }
}

function pushVertex(
  out: number[],
  p: [number, number],
  color: [number, number, number, number],
  heightAt: (x: number, y: number) => number = () => 0,
) {
  out.push(
    p[0],
    p[1],
    Math.max(0, heightAt(p[0], p[1])) + CAMPAIGN_FACTION_BORDER_LIFT_KM,
    color[0],
    color[1],
    color[2],
    color[3],
  );
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
