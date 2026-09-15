import type { CameraSnapshot } from '@packages/renderer-core/src/cameraUniform';
import { WORLD_CAMERA_WGSL } from '@packages/renderer-core/src/cameraWgsl';
import type { BackgroundRenderPass, OverlayRenderPass, RawFrameShell, WorldRenderPass } from '@packages/renderer-core/src/frameShell';
import { GrowableBuffer, makeVertexBuffer } from '@packages/renderer-core/src/gpuBuffers';
import { NOISE_WGSL } from '@packages/renderer-core/src/noiseWgsl';
import { cameraOnlyPipeline } from '@packages/renderer-core/src/pipelineContracts';
import { CAMPAIGN_SEA_PALETTE_WGSL } from '../water/waterPalette';
import { CampaignLabelFrame, type CampaignLabel, type CampaignLabelFrameStats } from './labelFrame';
import { buildLabelVertices, type CampaignLabelPlacementStyle } from './labelLayout';
import {
  createLightTexture,
  createRgbaTexture,
  flatMapSurface,
  type CampaignDrawnCoast,
  type CampaignMapStyle,
  type CampaignMapSurfaceMesh,
} from '@packages/game-renderer/src/campaign/mapSurface';

type CampaignLineRenderPass = BackgroundRenderPass | WorldRenderPass;


export interface CampaignMarker {
  x: number;
  y: number;
  radius: number;
  faction: [number, number, number];
  allegiance: [number, number, number];
  kind?: 'city' | 'army';
  selected?: boolean;
}


const MAP_WGSL = `
${WORLD_CAMERA_WGSL}
${NOISE_WGSL}
${CAMPAIGN_SEA_PALETTE_WGSL}
@group(1) @binding(0) var mapTex: texture_2d<f32>;
@group(1) @binding(1) var mapSampler: sampler;
@group(1) @binding(2) var biomeTex: texture_2d<f32>;
@group(1) @binding(3) var lightTex: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) world: vec2f,
  @location(2) height: f32,
};

@vertex
fn vs(@location(0) world: vec3f, @location(1) uv: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(world);
  out.uv = uv;
  out.world = world.xy;
  out.height = world.z;
  return out;
}

fn ridged(p: vec2f) -> f32 {
  let r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  return r * r;
}

fn nz(p: vec2f, freq: f32, px: f32) -> f32 {
  let fade = clamp(1.0 - freq * px * 2.2, 0.0, 1.0);
  if (fade <= 0.0) {
    return 0.5;
  }
  return mix(0.5, vnoise(p * freq), fade);
}

fn grade(c0: vec3f) -> vec3f {
  // Global tone toward the muted antique-chart target (campaign-map-polish 02):
  // the old grade over-saturated (1.06) and washed the map brighter (*1.05+0.02),
  // reading as a vivid webapp map. Pull saturation down, drop the brightness lift,
  // and warm slightly toward sepia so the whole chart sits in the Aegean register.
  var c = pow(max(c0, vec3f(0.0)), vec3f(0.95, 0.97, 1.0));
  let l = dot(c, vec3f(0.299, 0.587, 0.114));
  c = mix(vec3f(l), c, 0.84);
  c = c * 0.99 + vec3f(0.006);
  c *= vec3f(1.05, 1.0, 0.92);
  return clamp(c, vec3f(0.0), vec3f(1.0));
}

fn naturalCampaignColor(b: vec4f, light: f32, world: vec2f, h: f32) -> vec3f {
  let water = drawnWaterAmount(b.a);
  let px = max(fwidth(world.x), fwidth(world.y));
  var col = vec3f(0.0);
  if (water < 0.999) {
    let moisture = b.r;
    let g1 = nz(world, 0.9, px);
    let g2 = nz(world, 3.1, px);
    // Reach green earlier and land on a richer, less-yellow grass so temperate
    // Italy reads as living Mediterranean turf, not faded straw. The dry end
    // stays an olive (not tan) so mid-moisture plains keep a green cast.
    var grass = mix(vec3f(0.55, 0.56, 0.33), vec3f(0.42, 0.52, 0.29), smoothstep(0.16, 0.46, moisture));
    // Broad meadow patches: low-frequency darker/lusher and lighter sun-bleached
    // zones so a wide field is never one flat fill.
    let meadow = nz(world, 0.34, px);
    grass = mix(grass * vec3f(0.82, 0.94, 0.74), grass * vec3f(1.10, 1.06, 0.96), smoothstep(0.3, 0.7, meadow));
    grass *= 0.88 + 0.15 * g1 + 0.10 * g2;
    let dune = abs(nz(world, 0.16, px) * 2.0 - 1.0);
    var sand = mix(vec3f(0.90, 0.81, 0.60), vec3f(0.80, 0.69, 0.48), dune);
    sand *= 0.95 + 0.08 * nz(world, 1.6, px);
    var ground = mix(sand, grass, smoothstep(0.12, 0.28, moisture));
    let landShore = (b.a - 0.5) * 24.0;
    // Muted, thinner coastal sand: the old bright (0.85,0.78,0.60) over a wide
    // 0.05..0.6 band read as a glowing beach rim (05a critique). Pull the sand
    // toward the muted chart palette and tighten the band so the waterline is a
    // soft beach, not a lit edge.
    ground = mix(vec3f(0.77, 0.71, 0.56), ground, smoothstep(0.04, 0.42, landShore));
    let canopy = smoothstep(0.25, 0.70, b.g * (0.55 + 0.90 * nz(world, 0.55, px)));
    let forest = mix(vec3f(0.24, 0.36, 0.20), vec3f(0.32, 0.46, 0.26), nz(world, 1.9, px));
    ground = mix(ground, forest, canopy);
    let rockMask = smoothstep(0.35, 0.85, b.b) * (0.7 + 0.3 * g1);
    let rock = mix(vec3f(0.58, 0.50, 0.42), vec3f(0.72, 0.66, 0.58), nz(vec2f(world.x, world.y + h * 0.9), 0.7, px));
    ground = mix(ground, rock, rockMask);
    let snowAt = 30.0 + clamp((700.0 - world.y) * 0.006, 0.0, 7.0);
    let snow = smoothstep(snowAt, snowAt + 6.0, h + (nz(world, 0.5, px) - 0.5) * 6.0);
    ground = mix(ground, vec3f(0.86, 0.86, 0.83), snow * 0.7);
    let lit = pow(light * 2.0, 1.12);
    col = ground * (0.22 + 0.82 * lit);
  }
  if (water > 0.001) {
    let depth = clamp((0.5 - b.a) * 2.0, 0.0, 1.0);
    let shelf = smoothstep(0.0, 0.42, depth + (nz(world, 0.5, px) - 0.5) * 0.1);
    var waterCol = mix(CAMPAIGN_SEA_SHALLOW, CAMPAIGN_SEA_DEEP, shelf);
    waterCol += vec3f(0.05) * (nz(world, 1.15, px) - 0.5);
    let foam = smoothstep(0.6, 0.0, (0.5 - b.a) * 24.0) * smoothstep(0.4, 0.8, nz(world, 2.3, px));
    waterCol = mix(waterCol, vec3f(0.88, 0.93, 0.94), foam * 0.7);
    col = mix(col, waterCol, water);
  }
  let grain = vnoise(world * 0.05) * 0.6 + vnoise(world * 0.27) * 0.4;
  col *= 0.95 + 0.11 * grain;
  return grade(col);
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
  // Subtle sea shimmer, gated so the map reads as a still painted chart from
  // altitude and comes gently alive close in — opened by EITHER zoom (cam.zoom,
  // the chart scale, grows as the camera closes in) OR tilt (cam.tilt; 1 =
  // top-down, falls as the camera descends). The gate scales the glint
  // AMPLITUDE, never the drift phase: phase = time * gate(zoom) made the whole
  // glint field lurch sideways during a zoom (accumulated time times a moving
  // gate), and ungated amplitude left ~100km pale patches on the open sea at
  // overview. cam.time is 0 in frozen snapshots, so the drift vanishes and the
  // map stays byte-identical.
  let seaMotion = max(smoothstep(0.8, 2.0, cam.zoom), smoothstep(0.95, 0.70, cam.tilt));
  let drift = cam.time * 0.09;
  let wave = sin(in.world.x * 0.045 + in.world.y * 0.018 + vnoise(in.world * 0.022) * 2.2 + drift);
  let cross = sin(in.world.x * -0.021 + in.world.y * 0.052 + vnoise(in.world * 0.011 + vec2f(4.7, 9.2)) * 2.8 - drift * 0.7);
  let glint = smoothstep(0.58, 0.96, wave * 0.58 + cross * 0.42) * seaMotion;
  let foam = coast * seaMask * smoothstep(0.22, 0.88, vnoise(in.world * 0.055 + vec2f(2.0, 11.0)));
  let grain = vnoise(in.world * 0.18) * 0.052 + vnoise(in.world * 0.055 + vec2f(7.1, 2.4)) * 0.038;
  let striation = ridged(vec2f(in.world.x * 0.115 + in.world.y * 0.025, in.world.y * 0.085)) * 0.028;
  col *= 0.95 + grain + striation;
  let biome = textureSample(biomeTex, mapSampler, in.uv);
  let bakedLight = textureSample(lightTex, mapSampler, in.uv).r;
  col = mix(col, naturalCampaignColor(biome, bakedLight, in.world, in.height), __TERRAIN_MIX__);
  col = mix(col, vec3f(0.62, 0.76, 0.80), seaMask * glint * 0.24 * __SEA_TINT_MIX__);
  col = mix(col, vec3f(0.70, 0.80, 0.78), foam * 0.30 * __SEA_TINT_MIX__);
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
  let edge = vec3f(0.16, 0.12, 0.07);
  let parchment = vec3f(0.97, 0.94, 0.86);
  if (in.markerKind < 0.5) {
    // Cities no longer draw a GPU chip — the settlement icon is rendered above
    // the label (campaignCityLabels). Only armies reach this pass.
    discard;
  }
  let gold = vec3f(0.79, 0.64, 0.15);
  let pole = select(0.0, 1.0, abs(in.local.x + 0.55) < 0.045 && in.local.y > -0.96 && in.local.y < 0.94);
  let finial = select(0.0, 1.0, length(in.local - vec2f(-0.55, -0.9)) < 0.105);
  let crossbar = select(0.0, 1.0, in.local.x > -0.78 && in.local.x < 0.58 && abs(in.local.y + 0.58) < 0.035);
  let clothLeft = -0.38;
  let clothRight = 0.42;
  let clothMid = 0.02;
  let clothTop = -0.52;
  let clothBottom = 0.82;
  let notchTop = 0.58;
  let notchSlope = 0.34 / (clothBottom - notchTop);
  let clothRect = select(0.0, 1.0, in.local.x > clothLeft && in.local.x < clothRight && in.local.y > clothTop && in.local.y < clothBottom);
  let notch = select(0.0, 1.0, in.local.y > notchTop && abs(in.local.x - clothMid) < (in.local.y - notchTop) * notchSlope);
  let cloth = clothRect * (1.0 - notch);
  // Trim width is sized so the gold edging survives the 9 px whole-map marker
  // (0.035 quantized to sub-pixel there, erasing the cloth's contour).
  let trimW = 0.06;
  let sideTrim = cloth * select(0.0, 1.0, abs(in.local.x - clothLeft) < trimW || abs(in.local.x - clothRight) < trimW);
  let topTrim = cloth * select(0.0, 1.0, abs(in.local.y - clothTop) < trimW);
  let tailTrim = cloth * select(0.0, 1.0, in.local.y > clothBottom - 0.065 && abs(in.local.x - clothMid) > 0.18);
  let notchTrim = select(0.0, 1.0, in.local.y > notchTop && in.local.y < clothBottom && abs(abs(in.local.x - clothMid) - (in.local.y - notchTop) * notchSlope) < trimW);
  let trim = max(max(sideTrim, topTrim), max(tailTrim, notchTrim));
  let emblem = select(0.0, 1.0, abs(in.local.x - clothMid) + abs(in.local.y + 0.12) < 0.14);
  let selectedEdge = vec3f(0.96, 0.93, 0.84);
  let outline = select(
    0.0,
    1.0,
    in.selected > 0.5 &&
      in.local.x > -0.84 &&
      in.local.x < 0.64 &&
      in.local.y > -0.98 &&
      in.local.y < 0.96 &&
      (abs(in.local.x + 0.84) < 0.04 || abs(in.local.x - 0.64) < 0.04 || abs(in.local.y + 0.98) < 0.04 || abs(in.local.y - 0.96) < 0.04)
  );
  let alpha = max(max(max(pole, finial), max(crossbar, cloth)), max(max(trim, emblem), outline * 0.85));
  if (alpha <= 0.0) { discard; }
  let hardware = max(max(pole, finial), crossbar);
  let goldInk = max(max(trim, emblem), finial);
  // The cloth is graded from an ink-deepened foot to a parchment-lit head so a
  // livery that matches the land or its own territory wash (Arverni green over
  // green Gaul) still reads as solid cloth, not a hollow outline. The livery
  // hue stays the faction color — only luminance structure is added. (The head
  // is the low-y end now that the fragment y is flipped, so lift runs from the
  // foot up.)
  let clothLift = clamp((clothBottom - in.local.y) / (clothBottom - clothTop), 0.0, 1.0);
  let clothColor = mix(mix(in.faction, edge, 0.30), mix(in.faction, parchment, 0.26), clothLift);
  var fill = mix(edge, clothColor, cloth);
  fill = mix(fill, edge, hardware * (1.0 - finial));
  fill = mix(fill, gold, goldInk);
  return vec4f(mix(fill, selectedEdge, outline * 0.75), alpha);
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

export class CampaignMapPass {
  public readonly drawnCoast: CampaignDrawnCoast;
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private vertexBuffer: GPUBuffer;
  private indexBuffer: GPUBuffer;
  private indexCount: number;
  private terrainTextureSize: [number, number] | null;

  constructor(private shell: RawFrameShell, image: ImageBitmap, rect: { min: [number, number]; max: [number, number] }, style: CampaignMapStyle = {}, surface?: CampaignMapSurfaceMesh) {
    const device = shell.device;
    const terrainMix = style.terrainMix ?? (style.terrain ? 1 : 0);
    this.terrainTextureSize = style.terrain ? [style.terrain.width, style.terrain.height] : null;
    const module = device.createShaderModule({
      label: 'campaign-map-wgsl',
      code: MAP_WGSL
        .replaceAll('__SEA_TINT_MIX__', (style.seaTintMix ?? 0).toFixed(3))
        .replaceAll('__TERRAIN_MIX__', terrainMix.toFixed(3)),
    });
    const texture = device.createTexture({
      label: 'campaign-map-texture',
      size: [image.width, image.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: image }, { texture }, [image.width, image.height]);
    const biomeTexture = style.terrain
      ? createRgbaTexture(device, 'campaign-map-biome-texture', style.terrain.width, style.terrain.height, style.terrain.biome)
      : createRgbaTexture(device, 'campaign-map-biome-fallback', 1, 1, new Uint8Array([0, 0, 0, 128]));
    this.drawnCoast = { bg: texture.createView(), biome: biomeTexture.createView(), terrainMix };
    const lightTexture = style.terrain
      ? createLightTexture(device, 'campaign-map-light-texture', style.terrain.width, style.terrain.height, style.terrain.light)
      : createRgbaTexture(device, 'campaign-map-light-fallback', 1, 1, new Uint8Array([128, 128, 128, 255]));
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
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    this.bindGroup = device.createBindGroup({
      label: 'campaign-map-texture-bg',
      layout: texLayout,
      entries: [
        { binding: 0, resource: this.drawnCoast.bg },
        { binding: 1, resource: sampler },
        { binding: 2, resource: this.drawnCoast.biome },
        { binding: 3, resource: lightTexture.createView() },
      ],
    });
    this.pipeline = cameraOnlyPipeline(shell, {
      label: 'campaign-map-pipeline',
      module,
      buffers: [{
          arrayStride: 20,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x2' },
          ],
      }],
      target: 'opaque',
      depth: 'write',
      extraBindGroupLayouts: [texLayout],
    });
    const mesh = surface ?? flatMapSurface(rect);
    this.indexCount = mesh.indices.length;
    this.vertexBuffer = makeVertexBuffer(device, 'campaign-map-surface-vertices', mesh.vertices);
    this.indexBuffer = device.createBuffer({
      label: 'campaign-map-surface-indices',
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.indexBuffer, 0, mesh.indices);
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
    return {
      surfaceTriangles: Math.floor(this.indexCount / 3),
      terrainMix: this.drawnCoast.terrainMix,
      terrainTextureSize: this.terrainTextureSize,
      layer: this.drawnCoast.terrainMix > 0 ? 'canonical-biome-light-terrain' : 'background-raster-terrain',
    };
  }
}

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
