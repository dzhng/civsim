// terrainLayer — the battle ground on the photoreal substrate. Born as literal
// TSL ports of the production background quads (frameShell terrainWgsl/
// terrainBackdropWgsl), the height-displaced ground mesh (groundPass
// GROUND_WGSL, meadow branch unported), and the sealed-edge horizon blockers
// (horizonPass HORIZON_WGSL); since slice 09 they are standard-material
// responses with NEUTRAL albedos — the baked lambert/key-fill/exposure terms
// are extracted, the sun + IBL environment light them. The CPU geometry comes
// from the same builders the bespoke passes upload (buildBattleGroundMesh /
// buildBattleHorizonLayout). Distance haze comes ONLY from the shared
// aerial-perspective hook (scene.fogNode, slice 10b) — no material here adds
// its own haze, ever.
import * as THREE from 'three/webgpu';
import {
  attribute, clamp, float, length, mix, normalize, transformNormalToView, varying, vec2, vec3, vec4,
} from 'three/tsl';
import type { BattleGroundMesh } from '../../../game-renderer/src/battle/groundPass';
import type { BattleHorizonLayout } from '../../../game-renderer/src/battle/horizonPass';
import {
  fbmN, hashN, linearAlbedo, ridgeN, rgbNode, saturateN, smoothstepN, viewNormalNode, vnoiseN,
  type BattleFrameUniforms, type FloatNode, type Rgb, type Vec2Node,
} from './battleTsl';
import { fieldWaterSurfaceNodes } from './seaLayer';

export const RENDER_ORDER = {
  backdrop: -10,
  terrain: -9,
  markers: -8,
  worldOpaque: 0,
  // (1 and 2 were the 08a blob-shadow decal bands — deleted at 11, real CSM.)
  groundCues: 3,
  effectLines: 10,
  debugBlocks: 11,
  debugTriangles: 12,
} as const;

// frameShell TerrainShaderStyle — numeric mirror of the WGSL literals.
interface TerrainQuadStyle {
  oliveLow: Rgb;
  oliveHigh: Rgb;
  dry: Rgb;
  lightFleckLow: number;
  lightFleckHigh: number;
  darkFleckLow: number;
  darkFleckHigh: number;
  stoneFleckLow: number;
  stoneFleckHigh: number;
  speckleStrength: number;
  dryMixBase: number;
  trampleMix: number;
  stubbleColor: Rgb;
  stubbleStrength: number;
  darkFleckColor: Rgb;
  darkFleckStrength: number;
  stoneFleckStrength: number;
  dustStrength: number;
}

const DEFAULT_TERRAIN_STYLE: TerrainQuadStyle = {
  oliveLow: [0.43, 0.56, 0.22],
  oliveHigh: [0.66, 0.69, 0.33],
  dry: [0.76, 0.67, 0.39],
  lightFleckLow: 0.884,
  lightFleckHigh: 0.990,
  darkFleckLow: 0.820,
  darkFleckHigh: 0.982,
  stoneFleckLow: 0.924,
  stoneFleckHigh: 0.996,
  speckleStrength: 0.315,
  dryMixBase: 0.22,
  trampleMix: 0.15,
  stubbleColor: [0.53, 0.48, 0.25],
  stubbleStrength: 0.055,
  darkFleckColor: [0.47, 0.43, 0.32],
  darkFleckStrength: 0.38,
  stoneFleckStrength: 0.30,
  dustStrength: 0.14,
};

const WIDE_DETAIL_TERRAIN_STYLE: TerrainQuadStyle = {
  oliveLow: [0.44, 0.58, 0.22],
  oliveHigh: [0.68, 0.71, 0.33],
  dry: [0.75, 0.67, 0.39],
  lightFleckLow: 0.876,
  lightFleckHigh: 0.988,
  darkFleckLow: 0.800,
  darkFleckHigh: 0.976,
  stoneFleckLow: 0.916,
  stoneFleckHigh: 0.995,
  speckleStrength: 0.325,
  dryMixBase: 0.20,
  trampleMix: 0.14,
  stubbleColor: [0.52, 0.47, 0.25],
  stubbleStrength: 0.063,
  darkFleckColor: [0.45, 0.42, 0.31],
  darkFleckStrength: 0.42,
  stoneFleckStrength: 0.32,
  dustStrength: 0.12,
};

function quadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 2, 1, 1, 2, 3]); // the shell's triangle-strip order, listed
  return geo;
}

function setQuadRect(geo: THREE.BufferGeometry, [x, y, w, h]: [number, number, number, number]): void {
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const a = attr.array as Float32Array;
  a.set([x, y, 0, x + w, y, 0, x, y + h, 0, x + w, y + h, 0]);
  attr.needsUpdate = true;
}

// frameShell terrainWgsl groundHeight(p) — relief for the builtin quad shading.
function quadGroundHeight(p: Vec2Node): FloatNode {
  const broad = vnoiseN(p.mul(0.018).add(vec2(8.1, 2.4))).mul(0.58);
  const folds = ridgeN(vec2(p.x.mul(0.052).add(p.y.mul(0.018)), p.y.mul(0.038).sub(p.x.mul(0.012)))).mul(0.26);
  const scratch = ridgeN(vec2(p.x.mul(0.42).add(p.y.mul(0.09)), p.y.mul(0.26))).mul(0.16);
  return broad.add(folds).add(scratch);
}

function terrainQuadMaterial(style: TerrainQuadStyle, frame: BattleFrameUniforms): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.96, metalness: 0 });
  material.depthTest = false;
  material.depthWrite = false;
  const world = varying(attribute<'vec3'>('position', 'vec3').xy).toVar();
  const dist = varying(length(attribute<'vec3'>('position', 'vec3').xy.sub(vec2(frame.focus))));
  const fine = vnoiseN(world.mul(2.2)).toVar();
  const mid = vnoiseN(world.mul(0.47).add(vec2(5.2, 1.8))).toVar();
  const broad = vnoiseN(world.mul(0.085).add(vec2(0.7, 9.3))).toVar();
  const relief = quadGroundHeight(world).toVar();
  const hx = quadGroundHeight(world.add(vec2(1.8, 0.0))).sub(relief);
  const hy = quadGroundHeight(world.add(vec2(0.0, 1.8))).sub(relief);
  // The quad is 4 vertices: the relief normal must be per-fragment (a vertex
  // varying would interpolate flat) — the sun now shades it, not a baked lambert.
  material.normalNode = transformNormalToView(normalize(vec3(hx.mul(-1.45), hy.mul(-1.45), 1.0)));
  const grazing = smoothstepN(0.16, 0.86, ridgeN(vec2(world.x.mul(0.12).add(world.y.mul(0.03)), world.y.mul(0.09)))).toVar();
  const olive = mix(rgbNode(style.oliveLow), rgbNode(style.oliveHigh), mid.mul(0.66).add(fine.mul(0.16)).add(relief.mul(0.18)));
  const scrubPatch = smoothstepN(0.50, 0.86, broad).mul(float(1.0).sub(smoothstepN(0.86, 0.98, fine)));
  const trample = smoothstepN(0.72, 0.98, vnoiseN(world.add(vec2(13.0, -7.0)).mul(0.18)));
  const rakedDust = smoothstepN(0.58, 0.92, grazing).mul(relief.mul(0.08).add(0.08));
  const seed = world.mul(6.8).floor().toVar();
  const fleck = hashN(seed);
  const blade = hashN(seed.add(vec2(19.0, 41.0)));
  const pebble = hashN(seed.add(vec2(73.0, 11.0)));
  const stubble = smoothstepN(0.66, 0.95, ridgeN(vec2(world.x.mul(1.26).add(world.y.mul(0.18)), world.y.mul(0.84))));
  const lightFleck = smoothstepN(style.lightFleckLow, style.lightFleckHigh, fleck).mul(fine.mul(0.54).add(0.46));
  const darkFleck = smoothstepN(style.darkFleckLow, style.darkFleckHigh, blade).mul(float(1.0).sub(smoothstepN(0.76, 0.98, broad)));
  const stoneFleck = smoothstepN(style.stoneFleckLow, style.stoneFleckHigh, pebble).mul(relief.mul(0.46).add(0.36));
  const speckle = lightFleck.mul(style.speckleStrength);
  let grass = mix(olive, rgbNode(style.dry), trample.mul(style.trampleMix).add(style.dryMixBase));
  grass = mix(grass, vec3(0.31, 0.39, 0.18), scrubPatch.mul(0.34));
  grass = mix(grass, vec3(0.88, 0.75, 0.47), rakedDust);
  grass = grass.add(vec3(0.13, 0.12, 0.055).mul(speckle));
  grass = mix(grass, rgbNode(style.stubbleColor), stubble.mul(style.stubbleStrength));
  grass = mix(grass, grass.mul(rgbNode(style.darkFleckColor)), darkFleck.mul(style.darkFleckStrength));
  grass = mix(grass, vec3(0.46, 0.43, 0.32), stoneFleck.mul(style.stoneFleckStrength));
  const dust = smoothstepN(18.0, 96.0, dist).mul(style.dustStrength);
  const sunBleached = mix(grass, vec3(0.86, 0.72, 0.46), dust);
  material.colorNode = vec4(linearAlbedo(sunBleached), 1.0);
  return material;
}

function backdropMaterial(): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.98, metalness: 0 });
  material.depthTest = false;
  material.depthWrite = false;
  material.normalNode = viewNormalNode(vec3(0.0, 0.0, 1.0));
  const world = varying(attribute<'vec3'>('position', 'vec3').xy).toVar();
  const broad = vnoiseN(world.mul(0.055).add(vec2(4.7, 8.1)));
  const mid = vnoiseN(world.mul(0.42).add(vec2(11.3, 1.9)));
  const speck = smoothstepN(0.78, 0.98, vnoiseN(world.mul(2.8)));
  let grass = mix(vec3(0.16, 0.25, 0.12), vec3(0.30, 0.42, 0.20), broad);
  grass = mix(grass, vec3(0.11, 0.18, 0.10), smoothstepN(0.62, 0.94, mid).mul(0.38));
  grass = grass.add(vec3(0.10, 0.12, 0.04).mul(speck));
  material.colorNode = vec4(linearAlbedo(grass), 1.0);
  return material;
}

/** The background band: backdrop quad + builtin terrain quad (two styles,
 *  toggled by zoom exactly like drawFrame's terrainStyle). Deliberately
 *  OUTSIDE the slice-11 shadow set (neither casts nor receives): they are
 *  depthTest-off underlays beyond the heightfield, always shaded fullscreen
 *  under the real ground — receiving would pay per-pixel cascade sampling
 *  twice for pixels the aerial haze owns anyway. */
export class BattleBackgroundQuads {
  readonly backdrop: THREE.Mesh;
  readonly terrainDefault: THREE.Mesh;
  readonly terrainWide: THREE.Mesh;

  constructor(scene: THREE.Scene, frame: BattleFrameUniforms) {
    this.backdrop = new THREE.Mesh(quadGeometry(), backdropMaterial());
    this.backdrop.name = 'battle-backdrop';
    this.backdrop.renderOrder = RENDER_ORDER.backdrop;
    this.terrainDefault = new THREE.Mesh(quadGeometry(), terrainQuadMaterial(DEFAULT_TERRAIN_STYLE, frame));
    this.terrainDefault.name = 'battle-terrain-quad';
    this.terrainDefault.renderOrder = RENDER_ORDER.terrain;
    this.terrainWide = new THREE.Mesh(quadGeometry(), terrainQuadMaterial(WIDE_DETAIL_TERRAIN_STYLE, frame));
    this.terrainWide.name = 'battle-terrain-quad-wide';
    this.terrainWide.renderOrder = RENDER_ORDER.terrain;
    this.terrainWide.visible = false;
    for (const mesh of [this.backdrop, this.terrainDefault, this.terrainWide]) {
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }

  setRects(terrainRect: [number, number, number, number], backdropRect: [number, number, number, number]): void {
    setQuadRect(this.backdrop.geometry, backdropRect);
    setQuadRect(this.terrainDefault.geometry, terrainRect);
    setQuadRect(this.terrainWide.geometry, terrainRect);
  }

  setStyle(style: 'default' | 'wide-detail'): void {
    this.terrainDefault.visible = style === 'default';
    this.terrainWide.visible = style === 'wide-detail';
  }
}

/** The rolling battle ground mesh (groundPass port, meadow disabled). */
export function createGroundMesh(
  frame: BattleFrameUniforms,
  mesh: BattleGroundMesh,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const buffer = new THREE.InterleavedBuffer(mesh.vertices, 10);
  geo.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geo.setAttribute('gNormal', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  // 'normal' alias (same interleaved view): shadow.normalBias reads
  // normalWorld by attribute name — absent, the offset is silently zero (11).
  geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  geo.setAttribute('gColor', new THREE.InterleavedBufferAttribute(buffer, 3, 6));
  geo.setAttribute('gWater', new THREE.InterleavedBufferAttribute(buffer, 1, 9));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, metalness: 0 });
  const position = attribute<'vec3'>('position', 'vec3');
  const gNormal = attribute<'vec3'>('gNormal', 'vec3');
  material.normalNode = viewNormalNode(normalize(gNormal));
  const color = varying(attribute<'vec3'>('gColor', 'vec3')).toVar();
  const water = varying(attribute<'float'>('gWater', 'float')).toVar();
  const world = varying(position.xy).toVar();

  // Grass/ground micro-detail across scales (GROUND_WGSL fs, meadow off) —
  // NEUTRAL albedo variation; the sun + IBL environment light it.
  const drift = fbmN(world.mul(0.08)).sub(0.5).mul(0.10);
  const mottle = fbmN(world.mul(1.1)).sub(0.5).mul(0.13);
  const blade = fbmN(world.mul(4.7)).sub(0.5).mul(0.10).add(fbmN(world.mul(12.0)).sub(0.5).mul(0.06));
  const detail = clamp(drift.add(mottle).add(blade).add(1.0), 0.68, 1.32);
  let albedo = color.mul(detail);
  // Churn: trodden mud reads as broken ground (brown AND dark keys the earth).
  const brown = smoothstepN(0.0, 0.05, color.r.sub(color.g));
  const dark = float(1.0).sub(smoothstepN(0.30, 0.46, color.r.add(color.g).add(color.b).div(3.0)));
  const earth = brown.mul(dark);
  const clods = fbmN(world.mul(0.07)).mul(0.6).add(fbmN(world.mul(0.16).add(vec2(5.0, 2.0))).mul(0.4));
  const ruts = ridgeN(world.mul(vec2(0.11, 0.045)).add(vec2(2.0, 0.0)));
  const churn = clamp(clods.mul(0.72).add(ruts.mul(0.28)).add(0.58), 0.42, 1.30);
  albedo = mix(albedo, albedo.mul(churn), earth);
  // Field water: the shared water surface blended by the box-filtered weight
  // (albedo + roughness — wet ground gets a real sun sheen).
  const waterBlend = saturateN(water).toVar();
  const fieldWater = fieldWaterSurfaceNodes(frame, world, water);
  albedo = mix(albedo, fieldWater.albedo, waterBlend);
  material.colorNode = vec4(linearAlbedo(clamp(albedo, vec3(0.0), vec3(1.0))), 1.0);
  material.roughnessNode = mix(float(0.95), fieldWater.roughness, waterBlend);

  const ground = new THREE.Mesh(geo, material);
  ground.name = 'battle-ground';
  ground.frustumCulled = false;
  ground.renderOrder = RENDER_ORDER.worldOpaque;
  // Slice 11: the ground is the primary shadow RECEIVER (soldier/tree/cliff
  // shadows land here) but does NOT cast. A gently undulating heightfield at
  // a grazing golden-hour sun needs cot(elevation)·texel ≈ 2–3 world units of
  // depth bias in the far cascades to stop self-shadow ripple — a bias that
  // erases every soldier-sized shadow (verified on hardware shots). Terrain
  // self-occlusion is owned by 13 (relief look) / 14c (contact AO) instead.
  ground.receiveShadow = true;
  return ground;
}

/** The sealed-edge blocker mesh (horizonPass port — cliffs/walls/aprons). */
export function createHorizonBlockerMesh(layout: BattleHorizonLayout): THREE.Mesh | null {
  if (layout.mesh.indices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  const buffer = new THREE.InterleavedBuffer(layout.mesh.vertices, 10);
  geo.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geo.setAttribute('hNormal', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  // 'normal' alias for shadow.normalBias (see the ground-mesh note above).
  geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  geo.setAttribute('hColor', new THREE.InterleavedBufferAttribute(buffer, 3, 6));
  geo.setIndex(new THREE.BufferAttribute(layout.mesh.indices, 1));

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.92, metalness: 0 });
  material.normalNode = viewNormalNode(normalize(attribute<'vec3'>('hNormal', 'vec3')));
  const color = varying(attribute<'vec3'>('hColor', 'vec3'));
  const col = clamp(color, vec3(0.0), vec3(1.0));
  material.colorNode = vec4(linearAlbedo(col), 1.0);

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'battle-horizon-blockers';
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.worldOpaque;
  // Slice 11: headland cliffs/walls throw long shadows onto the field at low
  // sun and self-shade; they receive like every world surface.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
