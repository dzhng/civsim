import type { CameraSnapshot } from '../../../renderer-core/src/cameraUniform';
import { worldToScreen } from '../../../renderer-core/src/cameraUniform';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { gpuAlphaBlendColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { CAMPAIGN_SEA_PALETTE_WGSL } from '../water/waterPalette';
import type { BackgroundRenderPass, OverlayRenderPass, RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';

type CampaignLineRenderPass = BackgroundRenderPass | WorldRenderPass;

export interface CampaignMapNodeData {
  id?: number;
  name: string;
  pos: [number, number];
  kind: 'city' | 'junction';
  tier: number;
  owner: string;
}

export interface CampaignMapEdgeData {
  a?: number;
  b?: number;
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
  roadJunctionCaps: number;
  /** Road edges dropped whole because their centerline is mostly water. */
  roadEdgesCulled: number;
  /** Unbridged water gaps where a drawn road ribbon stops at a shore. */
  roadWaterGaps: number;
  cityMarkers: number;
  labels: number;
}

export interface CampaignMapStyle {
  seaTintMix?: number;
  terrainMix?: number;
  terrain?: CampaignMapTerrainTextures;
}

export interface CampaignMapDrawStyle {
  roadScale?: number;
  /** Road land test — point truth against the pixels the player sees (the
   * renderer supplies the full-res render mask). Roads draw where their
   * centerline is on rendered land; never used for label fitting. */
  roadSurfaceAt?: (x: number, y: number) => 'land' | 'water';
  /** Sea-label fitting only — an area statistic ("is this neighborhood
   * decisively land?"); the renderer supplies the coarse 8 km grid with a wide
   * inland margin. Deliberately NOT the road sampler: labels want area
   * statistics, roads want point truth. */
  surfaceAt?: (x: number, y: number) => 'land' | 'water';
  heightAt?: (x: number, y: number) => number;
}

export interface CampaignMapTerrainTextures {
  width: number;
  height: number;
  biome: Uint8Array;
  light: Uint8Array;
}

export interface CampaignMapSurfaceMesh {
  vertices: Float32Array;
  indices: Uint32Array;
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
  icon?: 'city' | 'army' | 'sword';
  iconColor?: [number, number, number];
  rightIcon?: 'sword';
  rightIconColor?: [number, number, number];
  sideText?: string;
  subText?: string;
  collisionGroup?: string;
  screenOffsetX?: number;
  screenOffsetY?: number;
  screenAnchorX?: 'center' | 'left' | 'right';
  screenAnchorY?: 'center' | 'top' | 'bottom';
  factionRadiusKm?: number;
  factionMinor?: boolean;
}

const ICON_PATHS = {
  city: 'M240,208H224V136l2.34,2.34A8,8,0,0,0,237.66,127L139.31,28.68a16,16,0,0,0-22.62,0L18.34,127a8,8,0,0,0,11.32,11.31L32,136v72H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16Zm-88,0H104V160a4,4,0,0,1,4-4h40a4,4,0,0,1,4,4Z',
  army: 'M230.4,219.19A8,8,0,0,1,224,232H32a8,8,0,0,1-6.4-12.8A67.88,67.88,0,0,1,53,197.51a40,40,0,1,1,53.93,0,67.42,67.42,0,0,1,21,14.29,67.42,67.42,0,0,1,21-14.29,40,40,0,1,1,53.93,0A67.85,67.85,0,0,1,230.4,219.19ZM27.2,126.4a8,8,0,0,0,11.2-1.6,52,52,0,0,1,83.2,0,8,8,0,0,0,12.8,0,52,52,0,0,1,83.2,0,8,8,0,0,0,12.8-9.61A67.85,67.85,0,0,0,203,93.51a40,40,0,1,0-53.93,0,67.42,67.42,0,0,0-21,14.29,67.42,67.42,0,0,0-21-14.29,40,40,0,1,0-53.93,0A67.88,67.88,0,0,0,25.6,115.2,8,8,0,0,0,27.2,126.4Z',
  sword: 'M202.7,17.4l35.9,35.9L104,187.9l-35.9-35.9L202.7,17.4ZM57.5,135.6l62.9,62.9-18.1,18.1-18.7-18.7-41.9,41.9-25.5-25.5 41.9-41.9-18.7-18.7 18.1-18.1Z',
} as const;

const MAP_WGSL = `
${WORLD_CAMERA_WGSL}
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
  let water = 1.0 - smoothstep(0.497, 0.503, b.a);
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
    let shelf = smoothstep(0.0, 0.28, depth + (nz(world, 0.5, px) - 0.5) * 0.1);
    var waterCol = mix(CAMPAIGN_SEA_SHALLOW, CAMPAIGN_SEA_DEEP, shelf);
    waterCol += vec3f(0.05) * (nz(world, 1.15, px) - 0.5);
    let foam = smoothstep(0.6, 0.0, (0.5 - b.a) * 24.0) * smoothstep(0.4, 0.8, nz(world, 2.3, px));
    waterCol = mix(waterCol, vec3f(0.88, 0.93, 0.94), foam * 0.55);
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
  // Subtle sea shimmer: the glint waves crawl on cam.time, gated so the map reads as a
  // still painted chart from altitude and comes gently alive close in — opened by
  // EITHER zoom (cam.zoom, the chart scale, grows as the camera closes in) OR tilt
  // (cam.tilt = sin of the camera pitch; 1 = top-down, falls as the camera descends).
  // cam.time is 0 in frozen snapshots, so the drift vanishes and the map stays
  // byte-identical.
  let seaMotion = max(smoothstep(0.8, 2.0, cam.zoom), smoothstep(0.95, 0.70, cam.tilt));
  let drift = cam.time * 0.09 * seaMotion;
  let wave = sin(in.world.x * 0.045 + in.world.y * 0.018 + vnoise(in.world * 0.022) * 2.2 + drift);
  let cross = sin(in.world.x * -0.021 + in.world.y * 0.052 + vnoise(in.world * 0.011 + vec2f(4.7, 9.2)) * 2.8 - drift * 0.7);
  let glint = smoothstep(0.58, 0.96, wave * 0.58 + cross * 0.42);
  let foam = coast * seaMask * smoothstep(0.22, 0.88, vnoise(in.world * 0.055 + vec2f(2.0, 11.0)));
  col = mix(col, vec3f(0.56, 0.70, 0.74), seaMask * glint * 0.14 * __SEA_TINT_MIX__);
  col = mix(col, vec3f(0.68, 0.77, 0.75), foam * 0.20 * __SEA_TINT_MIX__);
  let grain = vnoise(in.world * 0.18) * 0.052 + vnoise(in.world * 0.055 + vec2f(7.1, 2.4)) * 0.038;
  let striation = ridged(vec2f(in.world.x * 0.115 + in.world.y * 0.025, in.world.y * 0.085)) * 0.028;
  col *= 0.95 + grain + striation;
  let biome = textureSample(biomeTex, mapSampler, in.uv);
  let bakedLight = textureSample(lightTex, mapSampler, in.uv).r;
  col = mix(col, naturalCampaignColor(biome, bakedLight, in.world, in.height), __TERRAIN_MIX__);
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
  let anchor = projectWorld(vec3f(inst0.xy, 0.0));
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
  let parchment = vec3f(0.97, 0.94, 0.86);
  if (in.markerKind < 0.5) {
    let a = max(abs(in.local.x), abs(in.local.y));
    if (a > 1.0) { discard; }
    let border = step(0.72, a);
    // The faction fill can vanish into its own territory wash (the wash IS the
    // faction color over land), leaving only the ink frame — a hollow chip. So
    // the body carries tonal structure the map can't match: a top-lit grade
    // plus a beveled rim (parchment-lit top-left, ink-shaded bottom-right).
    let lift = clamp(in.local.y * 0.5 + 0.5, 0.0, 1.0);
    let flat = mix(in.faction, in.allegiance, 0.18);
    var body = mix(mix(flat, edge, 0.24), mix(flat, parchment, 0.26), lift);
    let bevel = step(0.46, a) * (1.0 - border);
    let lit = select(0.0, 1.0, in.local.y - in.local.x > 0.0);
    let rim = mix(mix(flat, edge, 0.42), mix(flat, parchment, 0.58), lit);
    body = mix(body, rim, bevel);
    return vec4f(mix(body, edge, border), 0.92);
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
  // hue stays the faction color — only luminance structure is added.
  let clothLift = clamp((in.local.y - clothTop) / (clothBottom - clothTop), 0.0, 1.0);
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

export interface CampaignLabelPassStats {
  labels: number;
  visibleLabels: number;
  visibleLabelNames: string[];
  visibleSeaLabelRects: CampaignLabelDebugRect[];
  collisionCulls: number;
  collisionCulledLabels: string[];
  atlasWidth: number;
  atlasHeight: number;
  vertices: number;
  layer: 'raw-gpu-glyph-atlas';
}

export interface CampaignLabelDebugRect {
  text: string;
  kind: CampaignLabel['kind'];
  opacity: number;
  box: { x: number; y: number; w: number; h: number };
  corners: [number, number][];
}

export class CampaignMapPass {
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private vertexBuffer: GPUBuffer;
  private indexBuffer: GPUBuffer;
  private indexCount: number;
  private terrainMix: number;
  private terrainTextureSize: [number, number] | null;

  constructor(private shell: RawFrameShell, image: ImageBitmap, rect: { min: [number, number]; max: [number, number] }, style: CampaignMapStyle = {}, surface?: CampaignMapSurfaceMesh) {
    const device = shell.device;
    this.terrainMix = style.terrainMix ?? (style.terrain ? 1 : 0);
    this.terrainTextureSize = style.terrain ? [style.terrain.width, style.terrain.height] : null;
    const module = device.createShaderModule({
      label: 'campaign-map-wgsl',
      code: MAP_WGSL
        .replaceAll('__SEA_TINT_MIX__', (style.seaTintMix ?? 0).toFixed(3))
        .replaceAll('__TERRAIN_MIX__', this.terrainMix.toFixed(3)),
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
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: biomeTexture.createView() },
        { binding: 3, resource: lightTexture.createView() },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-map-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, texLayout] }),
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
      fragment: { module, entryPoint: 'fs', targets: [{ format: shell.info.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('write'),
    });
    const mesh = surface ?? flatMapSurface(rect);
    this.indexCount = mesh.indices.length;
    this.vertexBuffer = device.createBuffer({
      label: 'campaign-map-surface-vertices',
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.indexBuffer = device.createBuffer({
      label: 'campaign-map-surface-indices',
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, mesh.vertices);
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
      terrainMix: this.terrainMix,
      terrainTextureSize: this.terrainTextureSize,
      layer: this.terrainMix > 0 ? 'canonical-biome-light-terrain' : 'background-raster-terrain',
    };
  }
}

function flatMapSurface(rect: { min: [number, number]; max: [number, number] }): CampaignMapSurfaceMesh {
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

function createRgbaTexture(device: GPUDevice, label: string, width: number, height: number, rgba: Uint8Array) {
  const texture = device.createTexture({
    label,
    size: [width, height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const rowBytes = width * 4;
  const bytesPerRow = align256(rowBytes);
  const source = bytesPerRow === rowBytes ? rgba : padRgbaRows(rgba, width, height, bytesPerRow);
  device.queue.writeTexture(
    { texture },
    source,
    { bytesPerRow, rowsPerImage: height },
    { width, height },
  );
  return texture;
}

function createLightTexture(device: GPUDevice, label: string, width: number, height: number, light: Uint8Array) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = light[i] ?? 128;
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return createRgbaTexture(device, label, width, height, rgba);
}

function align256(value: number) {
  return Math.ceil(value / 256) * 256;
}

function padRgbaRows(rgba: Uint8Array, width: number, height: number, bytesPerRow: number) {
  const rowBytes = width * 4;
  const padded = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    padded.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * bytesPerRow);
  }
  return padded;
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
        targets: [gpuAlphaBlendColorTarget(this.shell.info.format)],
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
    const device = this.shell.device;
    const positionSize = this.vertexFormat === 'xyz' ? 12 : 8;
    return device.createRenderPipeline({
      label: 'campaign-line-world-depth-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: positionSize + 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: this.vertexFormat === 'xyz' ? 'float32x3' : 'float32x2' },
            { shaderLocation: 1, offset: positionSize, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [gpuAlphaBlendColorTarget(this.shell.info.format)],
      },
      primitive: { topology: this.topology },
      depthStencil: gpuWorldDepthStencil('read'),
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

  constructor(
    private shell: RawFrameShell,
    private topology: GPUPrimitiveTopology,
    emptyLabel: string,
    private floatsPerVertex = 6,
  ) {
    this.vertexBuffer = shell.device.createBuffer({
      label: emptyLabel,
      size: this.floatsPerVertex * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(vertices: Float32Array) {
    this.vertexCount = Math.floor(vertices.length / this.floatsPerVertex);
    if (this.vertexCount > this.capacity) {
      this.capacity = Math.max(this.vertexCount, this.capacity * 2, 512);
      this.vertexBuffer = this.shell.device.createBuffer({
        label: 'campaign-line-vertices',
        size: this.capacity * this.floatsPerVertex * 4,
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
        targets: [gpuAlphaBlendColorTarget(this.shell.info.format)],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read'),
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
  private cityMarkerRadiiPx: number[] = [];

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
    this.cityMarkerRadiiPx = [...new Set(
      markers
        .filter((marker) => marker.kind === 'city')
        .map((marker) => Number(marker.radius.toFixed(3))),
    )].sort((a, b) => a - b);
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
    return {
      markers: this.markerCount,
      cityMarkerRadiiPx: this.cityMarkerRadiiPx,
      cityMarkerRadiusPx: this.cityMarkerRadiiPx[this.cityMarkerRadiiPx.length - 1] ?? 0,
    };
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
    visibleLabelNames: [],
    visibleSeaLabelRects: [],
    collisionCulls: 0,
    collisionCulledLabels: [],
    atlasWidth: 1,
    atlasHeight: 1,
    vertices: 0,
    layer: 'raw-gpu-glyph-atlas',
  };

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
      this.statsValue = {
        labels: labels.length,
        visibleLabels: 0,
        visibleLabelNames: [],
        visibleSeaLabelRects: [],
        collisionCulls: 0,
        collisionCulledLabels: [],
        atlasWidth: 1,
        atlasHeight: 1,
        vertices: 0,
        layer: 'raw-gpu-glyph-atlas',
      };
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
      visibleLabels: atlas.entries.length,
      visibleLabelNames: atlas.entries.slice(0, 128).map((entry) => `${entry.label.kind}:${labelText(entry.label)}`),
      visibleSeaLabelRects: labelDebugRects(atlas.entries, dpr).filter((entry) => entry.kind === 'sea'),
      collisionCulls: atlas.collisionCulls,
      collisionCulledLabels: atlas.collisionCulledLabels,
      atlasWidth: atlas.width,
      atlasHeight: atlas.height,
      vertices: this.vertexCount,
      layer: 'raw-gpu-glyph-atlas',
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
  const safeRoads: CampaignMapEdgeData[] = [];
  const roadAt = style.roadSurfaceAt;
  let roadEdgesCulled = 0;
  let roadWaterGaps = 0;
  for (const edge of data.map.edges) {
    if (edge.kind === 'sea') pushEdgeLines(lineVertices, edge);
    else if (roadEdgeIsLandSafe(edge, roadAt)) {
      safeRoads.push(edge);
      roadWaterGaps += pushRaisedRoad(roadMeshVertices, edge, style, roadAt);
    } else {
      roadEdgesCulled++;
    }
  }
  const roadJunctionCaps = pushRoadJunctionCaps(roadMeshVertices, data, safeRoads, style);
  const cityNodes = data.map.nodes.filter((node) => node.kind === 'city');
  const cityMarkers = cityNodes.map((node) => markerForNode(data, node));
  const labels = data.map.nodes.length > 20 ? fitSeaLabels(seaLabels(), style.surfaceAt) : [];
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
      roadJunctionCaps,
      roadEdgesCulled,
      roadWaterGaps,
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
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const dash = 12;
    const gap = 10;
    for (let d = 0; d < len; d += dash + gap) {
      const t0 = d / len;
      const t1 = Math.min(1, (d + dash) / len);
      const start: [number, number] = [a[0] + dx * t0, a[1] + dy * t0];
      const end: [number, number] = [a[0] + dx * t1, a[1] + dy * t1];
      pushBand(start, end, [0.43, 0.72, 0.88, 0.12], 0.30);
    }
  }
}

/** Returns the number of unbridged water gaps (drawn ribbon stops at a shore). */
function pushRaisedRoad(
  out: number[],
  edge: CampaignMapEdgeData,
  style: CampaignMapDrawStyle,
  at?: (x: number, y: number) => 'land' | 'water',
): number {
  if (edge.via.length < 2) return 0;
  const roadScale = style.roadScale ?? 1;
  const source = smoothRoadCenterline(edge.via);
  const center: [number, number][] = [[source[0][0], source[0][1]]];
  for (let i = 1; i < source.length; i++) {
    const a = source[i - 1];
    const b = source[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.round(len / ROAD_SURFACE_SAMPLE_KM));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      center.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const halfWidth = 0.55 * roadScale;
  const { runs, gaps } = roadLandRuns(center, at);
  for (const run of runs) {
    pushRoadRibbon(out, run, halfWidth * 1.58, 0.18 * roadScale, [0.30, 0.27, 0.23, 0.78], 0, style.heightAt);
    pushRoadRibbon(out, run, halfWidth, 0.32 * roadScale, [0.76, 0.74, 0.68, 0.98], 1, style.heightAt);
  }
  return gaps;
}

// Water dips up to this length along the smoothed centerline are bridged (the
// bake tolerates raw dips <= 3 km, which smoothing can stretch); anything
// longer is a ledgered ferry strait and the ribbon honestly stops at the
// shore. TWIN: ROAD_SMOOTHED_BRIDGE_KM in crates/mapgen/src/landroute.rs —
// the bake invariant guarantees committed roads never split except at ferries.
const ROAD_WATER_BRIDGE_KM = 4.5;

/** Split a resampled road centerline into its drawable land runs. */
function roadLandRuns(
  center: [number, number][],
  at?: (x: number, y: number) => 'land' | 'water',
): { runs: [number, number][][]; gaps: number } {
  if (!at) return { runs: [center], gaps: 0 };
  const land = center.map(([x, y]) => at(x, y) === 'land');
  // Bridge interior water dips by sample count (samples ride ~0.9 km apart —
  // the same counting the bake's smoothed-run invariant uses). Terminal water
  // is never bridged: road terminals sit on land nodes, so a water tail is
  // stale data and trimming beats drawing into the sea.
  const bridgeSamples = Math.round(ROAD_WATER_BRIDGE_KM / ROAD_SURFACE_SAMPLE_KM);
  let gaps = 0;
  let i = 0;
  while (i < center.length) {
    if (land[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < center.length && !land[j]) j++;
    const interior = i > 0 && j < center.length;
    if (interior && j - i <= bridgeSamples) {
      for (let k = i; k < j; k++) land[k] = true;
    } else if (interior) {
      gaps++;
    }
    i = j;
  }
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  for (let k = 0; k < center.length; k++) {
    if (land[k]) {
      run.push(center[k]);
    } else if (run.length > 0) {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
  }
  if (run.length >= 2) runs.push(run);
  return { runs, gaps };
}

function pushRoadJunctionCaps(out: number[], data: CampaignMapInputData, roads: CampaignMapEdgeData[], style: CampaignMapDrawStyle) {
  const byId = new Map<number, CampaignMapNodeData>();
  data.map.nodes.forEach((node, index) => byId.set(node.id ?? index, node));
  const degree = new Map<number, number>();
  for (const edge of roads) {
    if (edge.a !== undefined) degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    if (edge.b !== undefined) degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
  }
  const roadScale = style.roadScale ?? 1;
  let caps = 0;
  for (const [id, count] of degree) {
    const node = byId.get(id);
    if (!node || count < 3) continue;
    // City plazas used to be huge (tier-3 radius 4.7 + a 1.42x dark under-disc)
    // and read as an ugly shadow ring around capitals like Rome (feedback #9).
    // Keep the pavement just wide enough to seat the meeting roads, and keep the
    // dark rim as a hairline, not a halo.
    const cityRadius = node.kind === 'city' ? (node.tier >= 3 ? 2.1 : 1.7) : 1.15;
    const surfaceRadius = cityRadius * roadScale;
    pushRoadDisc(out, node.pos, surfaceRadius * 1.12, 0.19 * roadScale, [0.30, 0.27, 0.23, 0.45], 0, style.heightAt);
    pushRoadDisc(out, node.pos, surfaceRadius, 0.34 * roadScale, [0.77, 0.75, 0.69, 0.98], 1, style.heightAt);
    caps++;
  }
  return caps;
}

// TWIN: smooth_renderer_centerline in crates/mapgen/src/landroute.rs — the
// bake pre-verifies road land-safety through this exact smoothing, so change
// both together.
export function smoothRoadCenterline(points: [number, number][]) {
  if (points.length <= 2) return points;
  const smoothed: [number, number][] = [points[0]];
  for (let i = 1; i + 1 < points.length; i++) {
    const prev = points[i - 1];
    const point = points[i];
    const next = points[i + 1];
    smoothed.push(
      [point[0] * 0.72 + prev[0] * 0.14 + next[0] * 0.14, point[1] * 0.72 + prev[1] * 0.14 + next[1] * 0.14],
    );
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function roadEdgeIsLandSafe(edge: CampaignMapEdgeData, at?: (x: number, y: number) => 'land' | 'water') {
  if (!at) return true;
  let samples = 0;
  let landSamples = 0;
  for (let i = 1; i < edge.via.length; i++) {
    const a = edge.via[i - 1];
    const b = edge.via[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(2, Math.ceil(len / 3));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      samples++;
      if (at(x, y) === 'land') landSamples++;
    }
  }
  // Only a genuine sea crossing (a mostly-water polyline) drops whole; a road
  // that merely hugs the coast stays and draws its land runs. The sampler must
  // be point truth (the full-res render mask) — an area-statistic sampler here
  // culls whole coastal approach edges (bug B7b: roadless Cosa/Tarracina).
  return samples === 0 || landSamples / samples >= 0.5;
}

function pushRoadVertex(out: number[], point: [number, number], z: number, color: [number, number, number, number], uv: [number, number], material: number, heightAt?: (x: number, y: number) => number) {
  out.push(point[0], point[1], z + (heightAt?.(point[0], point[1]) ?? 0), ...color, uv[0], uv[1], material);
}

function pushRoadDisc(
  out: number[],
  center: [number, number],
  radius: number,
  z: number,
  color: [number, number, number, number],
  material: number,
  heightAt?: (x: number, y: number) => number,
) {
  const segments = 18;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0: [number, number] = [center[0] + Math.cos(a0) * radius, center[1] + Math.sin(a0) * radius];
    const p1: [number, number] = [center[0] + Math.cos(a1) * radius, center[1] + Math.sin(a1) * radius];
    pushRoadVertex(out, center, z, color, [0, 0], material, heightAt);
    pushRoadVertex(out, p0, z, color, [Math.cos(a0), Math.sin(a0)], material, heightAt);
    pushRoadVertex(out, p1, z, color, [Math.cos(a1), Math.sin(a1)], material, heightAt);
  }
}

function pushRoadRibbon(
  out: number[],
  center: [number, number][],
  halfWidth: number,
  z: number,
  color: [number, number, number, number],
  material: number,
  heightAt?: (x: number, y: number) => number,
) {
  if (center.length < 2) return;
  const left: [number, number, number][] = [];
  const right: [number, number, number][] = [];
  let distance = 0;
  for (let i = 0; i < center.length; i++) {
    if (i > 0) distance += Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1]);
    const p = center[i];
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(center.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push([p[0] - nx * halfWidth, p[1] - ny * halfWidth, distance * 0.26]);
    right.push([p[0] + nx * halfWidth, p[1] + ny * halfWidth, distance * 0.26]);
  }
  for (let i = 0; i + 1 < center.length; i++) {
    pushRoadVertex(out, [left[i][0], left[i][1]], z, color, [left[i][2], -1], material, heightAt);
    pushRoadVertex(out, [left[i + 1][0], left[i + 1][1]], z, color, [left[i + 1][2], -1], material, heightAt);
    pushRoadVertex(out, [right[i + 1][0], right[i + 1][1]], z, color, [right[i + 1][2], 1], material, heightAt);
    pushRoadVertex(out, [left[i][0], left[i][1]], z, color, [left[i][2], -1], material, heightAt);
    pushRoadVertex(out, [right[i + 1][0], right[i + 1][1]], z, color, [right[i + 1][2], 1], material, heightAt);
    pushRoadVertex(out, [right[i][0], right[i][1]], z, color, [right[i][2], 1], material, heightAt);
  }
}

const ROAD_SURFACE_SAMPLE_KM = 0.9;

function markerForNode(data: CampaignMapInputData, node: CampaignMapNodeData): CampaignMarker {
  const factionIndex = Math.max(0, data.map.factions.findIndex((faction) => faction.id === node.owner));
  const faction = data.map.factions[factionIndex]?.color ?? [154, 132, 90];
  return {
    x: node.pos[0],
    y: node.pos[1],
    radius: node.tier >= 3 ? 10 : 7,
    faction: [faction[0] / 255, faction[1] / 255, faction[2] / 255],
    allegiance: [faction[0] / 255, faction[1] / 255, faction[2] / 255],
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

// Sea labels are screen-space text anchored to world points; fit against the
// full-opacity threshold so the static placement is conservative before fadeout.
const SEA_LABEL_FIT_ZOOM = 0.26;
const SEA_LABEL_LAND_MARGIN_KM = 25;
const SEA_LABEL_MIN_SCALE = 0.55;
const SEA_LABEL_SHRINK_STEP = 0.05;
const SEA_LABEL_MAX_NUDGE_KM = 60;
const SEA_LABEL_NUDGE_STEP_KM = 10;
const SEA_LABEL_MARGIN_SAMPLES: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.707, 0.707],
  [-0.707, 0.707],
  [0.707, -0.707],
  [-0.707, -0.707],
];

function fitSeaLabels(
  labels: CampaignLabel[],
  at?: (x: number, y: number) => 'land' | 'water',
): CampaignLabel[] {
  if (!at) return labels;
  return labels.map((label) => fitSeaLabel(label, at));
}

function fitSeaLabel(
  label: CampaignLabel,
  at: (x: number, y: number) => 'land' | 'water',
): CampaignLabel {
  for (let scale = 1; scale >= SEA_LABEL_MIN_SCALE - 0.001; scale -= SEA_LABEL_SHRINK_STEP) {
    const candidate = withSeaLabelScale(label, scale);
    if (seaLabelClearsLand(candidate, at)) return candidate;
  }
  const shrunk = withSeaLabelScale(label, SEA_LABEL_MIN_SCALE);
  const angle = shrunk.angle ?? 0;
  const along: [number, number] = [Math.cos(angle), Math.sin(angle)];
  const across: [number, number] = [-Math.sin(angle), Math.cos(angle)];
  for (const nudge of seaLabelNudges()) {
    const candidate = {
      ...shrunk,
      x: shrunk.x + along[0] * nudge[0] + across[0] * nudge[1],
      y: shrunk.y + along[1] * nudge[0] + across[1] * nudge[1],
    };
    if (seaLabelClearsLand(candidate, at)) return candidate;
  }
  return shrunk;
}

function withSeaLabelScale(label: CampaignLabel, scale: number): CampaignLabel {
  return scale >= 0.995 ? label : { ...label, size: label.size * scale };
}

function seaLabelNudges(): [number, number][] {
  const nudges: [number, number][] = [];
  for (let distance = SEA_LABEL_NUDGE_STEP_KM; distance <= SEA_LABEL_MAX_NUDGE_KM; distance += SEA_LABEL_NUDGE_STEP_KM) {
    nudges.push(
      [0, distance],
      [0, -distance],
      [distance, 0],
      [-distance, 0],
      [distance, distance],
      [-distance, distance],
      [distance, -distance],
      [-distance, -distance],
    );
  }
  return nudges;
}

function seaLabelClearsLand(
  label: CampaignLabel,
  at: (x: number, y: number) => 'land' | 'water',
) {
  const samples = seaLabelWorldSamples(label);
  for (const point of samples) {
    for (const margin of SEA_LABEL_MARGIN_SAMPLES) {
      if (
        at(
          point[0] + margin[0] * SEA_LABEL_LAND_MARGIN_KM,
          point[1] + margin[1] * SEA_LABEL_LAND_MARGIN_KM,
        ) === 'land'
      ) {
        return false;
      }
    }
  }
  return true;
}

function seaLabelWorldSamples(label: CampaignLabel): [number, number][] {
  const text = labelText(label);
  const sizePx = Math.max(10, label.size);
  const letterSpacingPx = sizePx * 0.22;
  const glyphWidthsPx = Array.from(text).map((char) => seaGlyphWidthPx(char, sizePx));
  const widthPx = Math.max(
    1,
    glyphWidthsPx.reduce((sum, value) => sum + value, 0) + Math.max(0, glyphWidthsPx.length - 1) * letterSpacingPx,
  );
  const bend = label.curve ?? defaultSeaLabelCurve(label);
  const depthPx = bend * Math.min(sizePx * 1.35, Math.max(sizePx * 0.42, widthPx * 0.075));
  const halfWidthKm = Math.max(1, (widthPx * 0.5) / SEA_LABEL_FIT_ZOOM);
  const depthKm = depthPx / SEA_LABEL_FIT_ZOOM;
  const sizeKm = sizePx / SEA_LABEL_FIT_ZOOM;
  const angle = label.angle ?? 0;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const offsets = [-sizeKm * 0.78, 0, sizeKm * 0.36];
  const samples: [number, number][] = [];
  const steps = Math.max(12, Math.ceil(widthPx / 24));
  for (let i = 0; i <= steps; i++) {
    const t = -1 + (2 * i) / steps;
    const localX = t * halfWidthKm;
    const localY = depthKm * (1 - t * t);
    const slope = (-2 * depthKm * t) / halfWidthKm;
    const normalLen = Math.hypot(slope, 1) || 1;
    const nx = -slope / normalLen;
    const ny = 1 / normalLen;
    for (const offset of offsets) {
      const x = localX + nx * offset;
      const y = localY + ny * offset;
      samples.push([label.x + x * ca - y * sa, label.y + x * sa + y * ca]);
    }
  }
  return samples;
}

function seaGlyphWidthPx(char: string, sizePx: number) {
  if (char === ' ') return sizePx * 0.34;
  if ('ilI.,'.includes(char)) return sizePx * 0.28;
  if ('MW'.includes(char)) return sizePx * 0.94;
  if (char === char.toUpperCase() && char !== char.toLowerCase()) return sizePx * 0.72;
  return sizePx * 0.58;
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

interface MeasuredCampaignLabel extends VisibleCampaignLabel {
  text: string;
  sideText: string;
  subText: string;
  style: ReturnType<typeof labelStyle>;
  seaPath: SeaLabelPath | null;
  mainWidth: number;
  width: number;
  height: number;
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
        label.rightIcon ?? 'none',
        label.rightIconColor?.map((v) => v.toFixed(3)).join(',') ?? '',
        label.sideText ?? '',
        label.subText ?? '',
        label.collisionGroup ?? '',
        entry.offsetX.toFixed(2),
        entry.offsetY.toFixed(2),
        label.screenAnchorX ?? 'center',
        label.screenAnchorY ?? 'center',
        entry.opacity.toFixed(3),
        entry.screenX.toFixed(1),
        entry.screenY.toFixed(1),
      ].join(':');
    }),
  ].join('|');
}

function buildLabelAtlas(labels: VisibleCampaignLabel[], dpr: number) {
  const measure = document.createElement('canvas').getContext('2d')!;
  const measured = labels.map((entry): MeasuredCampaignLabel => {
    const style = labelStyle(entry.label, dpr);
    measure.font = style.font;
    measure.letterSpacing = style.letterSpacing;
    const text = labelText(entry.label);
    const sideText = entry.label.sideText ?? '';
    const subText = entry.label.subText ?? '';
    const iconWidth = entry.label.icon ? style.iconSize + style.iconGap : 0;
    const rightIconWidth = entry.label.rightIcon ? style.iconSize + style.iconGap : 0;
    const mainWidth = measure.measureText(text).width;
    const sideWidth = sideText ? style.sideGap + measureTextWithFont(measure, style.sideFont, style.letterSpacing, sideText) : 0;
    const subWidth = subText ? measureTextWithFont(measure, style.subFont, style.letterSpacing, subText) : 0;
    const seaPath = entry.label.kind === 'sea' ? measureSeaLabel(measure, style, entry.label, text) : null;
    return {
      ...entry,
      text,
      sideText,
      subText,
      style,
      seaPath,
      mainWidth,
      width: Math.max(1, Math.ceil(Math.max(seaPath?.width ?? mainWidth + iconWidth + sideWidth + rightIconWidth, subWidth) + style.padding * 2)),
      height: Math.max(1, Math.ceil((seaPath?.height ?? style.size * (subText ? 2.42 : 1.55)) + style.padding * 2)),
    };
  });
  const collision = cullOverlappingLabels(measured, dpr);
  const layoutEntries = collision.entries;
  const atlasWidth = measured.some((entry) => entry.width > 1024) ? 2048 : 1024;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const placements: (MeasuredCampaignLabel & { x: number; y: number })[] = [];
  for (const entry of layoutEntries) {
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
      if (entry.sideText) {
        const sx = tx + entry.mainWidth + entry.style.sideGap;
        ctx.font = entry.style.sideFont;
        ctx.lineWidth = entry.style.sideHaloWidth;
        ctx.strokeStyle = entry.style.halo;
        ctx.strokeText(entry.sideText, sx, ty);
        ctx.fillStyle = entry.style.sideFill;
        ctx.fillText(entry.sideText, sx, ty);
        ctx.font = entry.style.font;
      }
      if (entry.label.rightIcon) {
        const sideWidth = entry.sideText
          ? entry.style.sideGap + measureTextWithFont(ctx, entry.style.sideFont, entry.style.letterSpacing, entry.sideText)
          : 0;
        const ix = tx + entry.mainWidth + sideWidth + entry.style.iconGap;
        drawLabelIcon(
          ctx,
          { ...entry.label, icon: entry.label.rightIcon, iconColor: entry.label.rightIconColor },
          ix,
          ty - entry.style.iconSize * 0.84,
          entry.style,
        );
      }
    }
    if (entry.subText) {
      ctx.font = entry.style.subFont;
      const subWidth = ctx.measureText(entry.subText).width;
      const sx = entry.x + entry.width * 0.5 - subWidth * 0.5;
      const sy = ty + entry.style.subBaselineOffset;
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
  return {
    width: atlasWidth,
    height: atlasHeight,
    pixels: ctx.getImageData(0, 0, atlasWidth, atlasHeight).data,
    entries,
    collisionCulls: collision.culledLabels.length,
    collisionCulledLabels: collision.culledLabels.slice(0, 16),
  };
}

function cullOverlappingLabels(labels: MeasuredCampaignLabel[], dpr: number) {
  const composedArmyBounds = labels
    .filter((entry) => entry.label.kind === 'army' && Boolean(entry.label.subText))
    .map((entry) => ({ group: entry.label.collisionGroup, bounds: labelBounds(entry, dpr) }));
  if (composedArmyBounds.length === 0) return { entries: labels, culledLabels: [] };
  const entries: MeasuredCampaignLabel[] = [];
  const culledLabels: string[] = [];
  for (const entry of labels) {
    const cullsAgainstArmyCityLabel = entry.label.kind === 'city'
      && entry.label.collisionGroup !== undefined
      && composedArmyBounds.some((army) => army.group === entry.label.collisionGroup && overlaps(army.bounds, labelBounds(entry, dpr)));
    if (cullsAgainstArmyCityLabel) {
      culledLabels.push(`${entry.label.kind}:${labelText(entry.label)}`);
      continue;
    }
    entries.push(entry);
  }
  return { entries, culledLabels };
}

interface LabelBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function labelBounds(entry: MeasuredCampaignLabel, dpr: number): LabelBounds {
  const width = entry.width;
  const height = entry.height;
  const anchorOffsetX =
    entry.label.screenAnchorX === 'left'
      ? entry.offsetX + width * 0.5
      : entry.label.screenAnchorX === 'right'
        ? entry.offsetX - width * 0.5
        : entry.offsetX;
  const anchorOffsetY =
    entry.label.screenAnchorY === 'top'
      ? entry.offsetY + height * 0.5
      : entry.label.screenAnchorY === 'bottom'
        ? entry.offsetY - height * 0.5
        : entry.offsetY;
  const centerX = entry.screenX + anchorOffsetX;
  const centerY = entry.screenY + anchorOffsetY;
  const pad = Math.max(4 * dpr, entry.style.size * 0.16);
  return {
    x0: centerX - width * 0.5 - pad,
    y0: centerY - height * 0.5 - pad,
    x1: centerX + width * 0.5 + pad,
    y1: centerY + height * 0.5 + pad,
  };
}

function overlaps(a: LabelBounds, b: LabelBounds) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function labelDebugRects(entries: AtlasEntry[], dpr: number): CampaignLabelDebugRect[] {
  return entries.map((entry) => {
    const label = entry.label;
    const width = entry.width;
    const height = entry.height;
    const angle = label.angle ?? 0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const anchorOffsetX =
      label.screenAnchorX === 'left'
        ? entry.offsetX + width * 0.5
        : label.screenAnchorX === 'right'
          ? entry.offsetX - width * 0.5
          : entry.offsetX;
    const anchorOffsetY =
      label.screenAnchorY === 'top'
        ? entry.offsetY + height * 0.5
        : label.screenAnchorY === 'bottom'
          ? entry.offsetY - height * 0.5
          : entry.offsetY;
    const centerX = entry.screenX + anchorOffsetX;
    const centerY = entry.screenY + anchorOffsetY;
    const corners = [
      [-width * 0.5, -height * 0.5],
      [width * 0.5, -height * 0.5],
      [width * 0.5, height * 0.5],
      [-width * 0.5, height * 0.5],
    ].map(([x, y]): [number, number] => [
      roundPx((centerX + x * c - y * s) / dpr),
      roundPx((centerY + x * s + y * c) / dpr),
    ]);
    const xs = corners.map((corner) => corner[0]);
    const ys = corners.map((corner) => corner[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const x1 = Math.max(...xs);
    const y1 = Math.max(...ys);
    return {
      text: labelText(label),
      kind: label.kind,
      opacity: roundPx(entry.opacity),
      box: { x: roundPx(x0), y: roundPx(y0), w: roundPx(x1 - x0), h: roundPx(y1 - y0) },
      corners,
    };
  });
}

function roundPx(value: number) {
  return Number(value.toFixed(3));
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
    const anchorOffsetX =
      label.screenAnchorX === 'left'
        ? entry.offsetX + width * 0.5
        : label.screenAnchorX === 'right'
          ? entry.offsetX - width * 0.5
          : entry.offsetX;
    const anchorOffsetY =
      label.screenAnchorY === 'top'
        ? entry.offsetY + height * 0.5
        : label.screenAnchorY === 'bottom'
          ? entry.offsetY - height * 0.5
          : entry.offsetY;
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
      vertices[o++] = ox + anchorOffsetX;
      vertices[o++] = oy + anchorOffsetY;
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
      sideFont: `400 ${size * 0.7}px Georgia, 'Times New Roman', serif`,
      sideFill: 'rgba(196,214,232,0.72)',
      sideGap: size * 0.25,
      sideHaloWidth: 1.6 * dpr,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: 'rgba(232,224,208,0.92)',
      subHaloWidth: 2 * dpr,
      subBaselineOffset: size * 0.98,
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
      sideFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      sideFill: 'rgba(238,232,218,0.95)',
      sideGap: size * 0.42,
      sideHaloWidth: 2.4 * dpr,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: 'rgba(248,244,237,0.96)',
      subHaloWidth: 2.7 * dpr,
      subBaselineOffset: size * 1.14,
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
      sideFont: `600 ${size * 0.68}px Cinzel, Georgia, 'Times New Roman', serif`,
      sideFill: 'rgba(232,224,208,0.92)',
      sideGap: size * 0.35,
      sideHaloWidth: 2 * dpr,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: 'rgba(232,224,208,0.92)',
      subHaloWidth: 2 * dpr,
      subBaselineOffset: size * 0.98,
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
    sideFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
    sideFill: 'rgba(238,232,218,0.95)',
    sideGap: size * 0.42,
    sideHaloWidth: 2.4 * dpr,
    subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
    subFill: 'rgba(248,244,237,0.96)',
    subHaloWidth: 2.7 * dpr,
    subBaselineOffset: size * 0.98,
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
  const color = label.iconColor ?? [0.57, 0.49, 0.36];
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
