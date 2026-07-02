// seaLayer — the ONE water seam of the photoreal battle world. The sea uses
// the Gerstner TSL displacement source selected by the 12a verdict, shaded as
// a standard material so Fresnel reflection and GGX sun glint come from the
// same SkyModel LUT/IBL and sun that light the rest of the scene. Distance
// haze comes ONLY from the shared aerial-perspective hook (scene.fogNode,
// slice 10b) — the sea dissolves into the sky through it, never through an
// inline haze mix.
import * as THREE from 'three/webgpu';
import {
  dot, float, length, mix, normalize, transformNormalToView, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { attribute } from 'three/tsl';
import { bakeGerstnerWaves } from '../../../game-renderer/src/water/gerstnerField';
import { FIELD_WATER_RAMP, type WaterShoreRamp } from '../../../game-renderer/src/water/waterShoreRamp';
import type { BattleOceanPlaneSpec } from '../../../game-renderer/src/battle/horizonPass';
import {
  fnoiseN, linearAlbedo, rgbNode, saturateN, smoothstepN,
  type BattleFrameUniforms, type FloatNode, type Vec2Node, type Vec3Node,
} from './battleTsl';

// The neutral scattering colour the sea contributes beneath its sky reflection.
// These are display-authored effective albedos: pale Aegean turquoise in the
// shallows and a restrained deep-water blue offshore under the golden preset.
const WATER_SHALLOW_ALBEDO: [number, number, number] = [0.22, 0.58, 0.60];
const WATER_DEEP_ALBEDO: [number, number, number] = [0.025, 0.095, 0.22];
const WATER_FOAM_ALBEDO: [number, number, number] = [0.92, 0.93, 0.94];
// Calm water is glossy: the sun track is standard-material GGX specular from
// the live environment sun; foam stays matte.
const WATER_ROUGHNESS = 0.075;
const WATER_FOAM_ROUGHNESS = 0.78;
// 12b trap: the sea looked right nearby but sparkled like aliasing in the
// grazing upper band. Fade normal detail with distance from the battle focus;
// aerial haze remains owned by scene.fogNode.
const SEA_NORMAL_DETAIL_NEAR = 0.92;
const SEA_NORMAL_DETAIL_FAR = 0.18;
const SEA_NORMAL_DETAIL_FADE_START = 720;
const SEA_NORMAL_DETAIL_FADE_END = 2300;
const SEA_SURFACE_OWNER = 'skyModel-ibl-standard-pbr' as const;

interface WaterSampleNodes {
  height: FloatNode;
  normal: Vec3Node;
  foam: FloatNode;
}

export type SeaDisplacementSourceId = 'gerstner-tsl';
export type SeaDisplacementTier = 'gerstner-tsl';

export interface SeaSurfaceStats {
  owner: typeof SEA_SURFACE_OWNER;
  skyReflection: 'scene.environment:skyModel-lut';
  sunGlint: 'mesh-standard-ggx';
  shallowAlbedo: [number, number, number];
  deepAlbedo: [number, number, number];
  foamAlbedo: [number, number, number];
  roughness: number;
  foamRoughness: number;
  normalDetail: {
    near: number;
    far: number;
    fadeStart: number;
    fadeEnd: number;
  };
}

export interface SeaDisplacementStats {
  requested: SeaDisplacementSourceId;
  source: SeaDisplacementSourceId;
  tier: SeaDisplacementTier;
  fallback: boolean;
  resolution: number;
  cascades: number;
  storageBytes: number;
  surface: SeaSurfaceStats;
}

export interface SeaDisplacementSource {
  readonly requested: SeaDisplacementSourceId;
  readonly source: SeaDisplacementSourceId;
  readonly tier: SeaDisplacementTier;
  sample(p: Vec2Node, t: FloatNode): WaterSampleNodes;
  height(p: Vec2Node, t: FloatNode): FloatNode;
  stats(): SeaDisplacementStats;
}

class GerstnerSeaSource implements SeaDisplacementSource {
  readonly source = 'gerstner-tsl' as const;
  readonly requested: SeaDisplacementSourceId;
  readonly tier: SeaDisplacementTier;

  constructor(
    requested: SeaDisplacementSourceId = 'gerstner-tsl',
    tier: SeaDisplacementTier = 'gerstner-tsl',
  ) {
    this.requested = requested;
    this.tier = tier;
  }

  sample(p: Vec2Node, t: FloatNode): WaterSampleNodes {
    return waterFieldNodes(p, t);
  }

  height(p: Vec2Node, t: FloatNode): FloatNode {
    return waterHeightNode(p, t);
  }

  stats(): SeaDisplacementStats {
    return {
      requested: this.requested,
      source: this.source,
      tier: this.tier,
      fallback: this.requested !== this.source,
      resolution: 1,
      cascades: 1,
      storageBytes: 0,
      surface: seaSurfaceStats(),
    };
  }
}

export function seaDisplacementSourceFromParam(value: string | null | undefined): SeaDisplacementSourceId {
  const normalized = value === 'gerstner' || value === 'gerstner-tsl' ? value : 'gerstner-tsl';
  return normalized === 'gerstner' ? 'gerstner-tsl' : normalized;
}

export function createSeaDisplacementSource(
  requested: SeaDisplacementSourceId = 'gerstner-tsl',
): SeaDisplacementSource {
  return new GerstnerSeaSource(requested);
}

export function seaSurfaceStats(): SeaSurfaceStats {
  return {
    owner: SEA_SURFACE_OWNER,
    skyReflection: 'scene.environment:skyModel-lut',
    sunGlint: 'mesh-standard-ggx',
    shallowAlbedo: WATER_SHALLOW_ALBEDO,
    deepAlbedo: WATER_DEEP_ALBEDO,
    foamAlbedo: WATER_FOAM_ALBEDO,
    roughness: WATER_ROUGHNESS,
    foamRoughness: WATER_FOAM_ROUGHNESS,
    normalDetail: {
      near: SEA_NORMAL_DETAIL_NEAR,
      far: SEA_NORMAL_DETAIL_FAR,
      fadeStart: SEA_NORMAL_DETAIL_FADE_START,
      fadeEnd: SEA_NORMAL_DETAIL_FADE_END,
    },
  };
}

/** The analytic Gerstner field (gerstnerField.ts waterField), evaluated as a
 *  TSL node graph over the shared baked wave list. Wave phases are baked in JS
 *  (the WGSL hashed them per-wave from the same constants). */
export function waterFieldNodes(p: Vec2Node, t: FloatNode): WaterSampleNodes {
  const waves = bakeGerstnerWaves();
  const g = 9.81;
  let h: FloatNode = float(0.0);
  let slopeX: FloatNode = float(0.0);
  let slopeY: FloatNode = float(0.0);
  for (let i = 0; i < waves.length; i++) {
    const wv = waves[i];
    const k = 6.2831853 / wv.wavelength;
    const w = Math.sqrt(g * k);
    // Per-wave phase offset so the trains don't all align at the world origin.
    const ph0 = fract53(Math.sin(i * 127.1 + wv.wavelength * 3.71) * 43758.5453) * 6.2831853;
    const phase = dot(vec2(wv.dirX, wv.dirY), p).mul(k).sub(t.mul(w * 0.42)).add(ph0).toVar();
    const s = phase.sin().toVar();
    const c = phase.cos().toVar();
    const hump = s.mul(0.5).add(0.5).toVar(); // 0..1 wave profile
    const sharp = hump.mul(hump); // narrow peaks, wide flat troughs
    h = h.add(sharp.sub(0.333).mul(wv.amplitude));
    const dHump = hump.mul(c); // d(sharp)/d(phase)
    const dphase = dHump.mul(wv.amplitude * 2.0 * k).toVar();
    slopeX = slopeX.add(dphase.mul(wv.dirX));
    slopeY = slopeY.add(dphase.mul(wv.dirY));
  }
  const height = h.toVar();
  const normal = normalize(vec3(slopeX.negate(), slopeY.negate(), 1.0)).toVar();
  // Whitecaps cap the crest TOPS, broken into granular spray by fnoise speckle.
  const cover = smoothstepN(1.3, 3.1, height);
  const speckle = fnoiseN(p.mul(0.5).add(vec2(t.mul(0.10), t.mul(0.05)))).mul(0.42)
    .add(fnoiseN(p.mul(1.3).sub(vec2(t.mul(0.06), t.mul(0.09)))).mul(0.34))
    .add(fnoiseN(p.mul(3.0).add(vec2(t.mul(0.04), t.mul(-0.07)))).mul(0.24));
  const foam = cover.mul(smoothstepN(0.42, 0.66, speckle)).mul(0.9).toVar();
  return { height, normal, foam };
}

/** The vertex-stage displacement height only (the plane pass evaluates the
 *  field twice: vertex for displacement, fragment for the crisp normal). */
export function waterHeightNode(p: Vec2Node, t: FloatNode): FloatNode {
  const waves = bakeGerstnerWaves();
  const g = 9.81;
  let h: FloatNode = float(0.0);
  for (let i = 0; i < waves.length; i++) {
    const wv = waves[i];
    const k = 6.2831853 / wv.wavelength;
    const w = Math.sqrt(g * k);
    const ph0 = fract53(Math.sin(i * 127.1 + wv.wavelength * 3.71) * 43758.5453) * 6.2831853;
    const phase = dot(vec2(wv.dirX, wv.dirY), p).mul(k).sub(t.mul(w * 0.42)).add(ph0);
    const hump = phase.sin().mul(0.5).add(0.5).toVar();
    h = h.add(hump.mul(hump).sub(0.333).mul(wv.amplitude));
  }
  return h;
}

/** waterShoreRamp(shoreDist) → depth01 (the haze leg of the shared ramp
 *  table is a bespoke-WGSL knob; photoreal haze is the aerial owner's). */
export function shoreDepthNode(ramp: WaterShoreRamp, shoreDist: FloatNode): FloatNode {
  return smoothstepN(ramp.depthNear, ramp.depthFar, shoreDist);
}

export interface WaterSurfaceNodes {
  /** Neutral albedo (depth-graded blue + foam). */
  albedo: Vec3Node;
  foam: FloatNode;
  roughness: FloatNode;
}

/** The one civsim water surface response: every photoreal water surface
 *  (ocean planes, on-field water in the ground material) composes through
 *  this, so shorelines cannot show a stripe. Neutral albedo — the environment
 *  lights it, the aerial owner hazes it. */
export function waterSurfaceNodes(
  depth01: FloatNode,
  foamRaw: FloatNode,
): WaterSurfaceNodes {
  const foam = saturateN(foamRaw).toVar();
  let albedo = mix(rgbNode(WATER_SHALLOW_ALBEDO), rgbNode(WATER_DEEP_ALBEDO), depth01);
  albedo = mix(albedo, rgbNode(WATER_FOAM_ALBEDO), foam);
  albedo = linearAlbedo(albedo);
  const roughness = mix(float(WATER_ROUGHNESS), float(WATER_FOAM_ROUGHNESS), foam);
  return { albedo, foam, roughness };
}

/** fieldWaterWgsl fieldWaterColor's surface terms — the on-field battle water
 *  (calm: swash lace pinned to the waterline, no swell), keyed on the
 *  box-filtered water weight. The ground material blends these over turf by
 *  the same weight. */
export function fieldWaterSurfaceNodes(
  frame: BattleFrameUniforms,
  p: Vec2Node,
  shoreDist: FloatNode,
): WaterSurfaceNodes {
  const swash = smoothstepN(0.16, 0.02, shoreDist).mul(smoothstepN(0.006, 0.03, shoreDist));
  const lace = fnoiseN(p.mul(1.2).add(vec2(frame.time.mul(0.05), 0.0))).mul(0.28).add(0.72);
  return waterSurfaceNodes(shoreDepthNode(FIELD_WATER_RAMP, shoreDist), swash.mul(lace).mul(0.7));
}

/** One battle ocean-edge plane (waterPlanePass battle mode): the displaced
 *  grid mesh + the shore-keyed standard-material water surface. */
export function createOceanPlaneMesh(
  frame: BattleFrameUniforms,
  spec: BattleOceanPlaneSpec,
  displacement: SeaDisplacementSource = createSeaDisplacementSource(),
): THREE.Mesh {
  const { rect } = spec;
  const side = rect.res + 1;
  const positions = new Float32Array(side * side * 3);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const o = (j * side + i) * 3;
      positions[o] = rect.x0 + ((rect.x1 - rect.x0) * i) / rect.res;
      positions[o + 1] = rect.y0 + ((rect.y1 - rect.y0) * j) / rect.res;
      positions[o + 2] = 0;
    }
  }
  const indices = new Uint32Array(rect.res * rect.res * 6);
  let k = 0;
  for (let j = 0; j < rect.res; j++) {
    for (let i = 0; i < rect.res; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, metalness: 0 });
  const worldXY = attribute<'vec3'>('position', 'vec3').xy;
  material.positionNode = vec3(worldXY, displacement.height(worldXY, frame.time).add(spec.baseZ));
  const fragXY = varying(worldXY).toVar();
  // Depth and agitation ramp on DIFFERENT distances: pale turquoise near the
  // beach → deeper blue offshore; the visible sea stays calm, whitecaps build
  // only with real swell agitation.
  const shoreDist = fragXY.x.sub(spec.shoreX).abs().toVar();
  const depth01 = mix(float(0.30), float(0.80), smoothstepN(0.0, 500.0, shoreDist));
  const agitation = smoothstepN(0.0, 3200.0, shoreDist).toVar();
  const viewDist = length(fragXY.sub(vec2(frame.focus))).toVar();
  const distanceFade = smoothstepN(SEA_NORMAL_DETAIL_FADE_START, SEA_NORMAL_DETAIL_FADE_END, viewDist).toVar();
  const detail = mix(float(SEA_NORMAL_DETAIL_NEAR), float(SEA_NORMAL_DETAIL_FAR), distanceFade).toVar();
  // Fragment-stage field sample = the crisp swell normal. Fade high-frequency
  // normal detail with distance so the grazing band cannot sparkle/moire.
  const s = displacement.sample(fragXY, frame.time);
  const normalStrength = mix(float(0.30), float(1.0), agitation).mul(detail);
  const surfaceNormal = normalize(mix(vec3(0.0, 0.0, 1.0), s.normal, normalStrength));
  material.normalNode = transformNormalToView(surfaceNormal);
  const surface = waterSurfaceNodes(depth01, s.foam.mul(agitation));
  material.colorNode = vec4(surface.albedo, 1.0);
  material.roughnessNode = surface.roughness;

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'battle-ocean-plane';
  mesh.frustumCulled = false;
  return mesh;
}

function fract53(x: number): number {
  return x - Math.floor(x);
}
