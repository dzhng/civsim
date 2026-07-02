// seaLayer — the ONE water seam of the photoreal battle world (slice 08a).
// Since slice 09 the sea is a standard-material response: the Gerstner-family
// displacement/foam/shore seam survives (fed by the SAME baked wave list —
// bakeGerstnerWaves — and the SAME ocean-plane layout the bespoke horizonPass
// builds), but the surface carries a NEUTRAL albedo + roughness and the sun /
// IBL light it like every other world surface. SCAFFOLD per the README
// ledger: this parity-derived Gerstner shading dies at 12b–d (photoreal
// surface); the seam survives. Distance haze comes ONLY from the shared
// aerial-perspective hook (scene.fogNode, slice 10b) — the sea dissolves into
// the sky through it, never through a shore-keyed albedo mix.
import * as THREE from 'three/webgpu';
import {
  dot, float, mix, normalize, transformNormalToView, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { attribute } from 'three/tsl';
import { bakeGerstnerWaves } from '../../../game-renderer/src/water/gerstnerField';
import { FIELD_WATER_RAMP, type WaterShoreRamp } from '../../../game-renderer/src/water/waterShoreRamp';
import type { BattleOceanPlaneSpec } from '../../../game-renderer/src/battle/horizonPass';
import {
  fnoiseN, linearAlbedo, rgbNode, saturateN, smoothstepN,
  type BattleFrameUniforms, type FloatNode, type Vec2Node, type Vec3Node,
} from './battleTsl';

// The neutral albedo the sea *is*, before any lighting mood. Waterpalette's
// display constants were authored as LIT sea colours for the baked pipeline;
// as effective albedo (real water "colour" is scattering, not diffuse
// reflectance) they read a register brighter so the shallows keep the pale
// Aegean turquoise (aesthetics rule 4) under a physical sun instead of
// collapsing to navy. The photoreal sea surface proper lands at 12b–d.
const WATER_SHALLOW_ALBEDO: [number, number, number] = [0.24, 0.52, 0.53];
const WATER_DEEP_ALBEDO: [number, number, number] = [0.04, 0.12, 0.26];
const WATER_FOAM_ALBEDO: [number, number, number] = [0.92, 0.93, 0.94];
// Calm water is glossy (the sun glint is real GGX specular now); foam matte.
const WATER_ROUGHNESS = 0.14;
const WATER_FOAM_ROUGHNESS = 0.85;

interface WaterSampleNodes {
  height: FloatNode;
  normal: Vec3Node;
  foam: FloatNode;
}

export type SeaDisplacementSourceId = 'gerstner-tsl' | 'ifft-tsl';
export type SeaDisplacementTier =
  | 'gerstner-tsl'
  | 'ifft-tsl-spectral-spike'
  | 'gerstner-tsl-swiftshader-fallback';

export interface SeaDisplacementStats {
  requested: SeaDisplacementSourceId;
  source: SeaDisplacementSourceId;
  tier: SeaDisplacementTier;
  fallback: boolean;
  resolution: number;
  cascades: number;
  storageBytes: number;
}

export interface SeaDisplacementSource {
  readonly requested: SeaDisplacementSourceId;
  readonly source: SeaDisplacementSourceId;
  readonly tier: SeaDisplacementTier;
  sample(p: Vec2Node, t: FloatNode): WaterSampleNodes;
  height(p: Vec2Node, t: FloatNode): FloatNode;
  stats(): SeaDisplacementStats;
}

interface SpectralWave {
  dirX: number;
  dirY: number;
  wavelength: number;
  amplitude: number;
  speedScale: number;
  phase: number;
}

const IFFT_RESOLUTION = 256;
const IFFT_CASCADE_COUNT = 3;
const IFFT_STORAGE_BYTES = IFFT_CASCADE_COUNT * IFFT_RESOLUTION * IFFT_RESOLUTION * 4 * 4 * 4;
const IFFT_WAVES = bakeIfftSpectralSpikeWaves();

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
    };
  }
}

class IfftSpectralSpikeSeaSource implements SeaDisplacementSource {
  readonly requested = 'ifft-tsl' as const;
  readonly source = 'ifft-tsl' as const;
  readonly tier = 'ifft-tsl-spectral-spike' as const;

  sample(p: Vec2Node, t: FloatNode): WaterSampleNodes {
    let h: FloatNode = float(0.0);
    let slopeX: FloatNode = float(0.0);
    let slopeY: FloatNode = float(0.0);
    let jacobian: FloatNode = float(0.0);
    for (let i = 0; i < IFFT_WAVES.length; i++) {
      const wv = IFFT_WAVES[i];
      const k = 6.2831853 / wv.wavelength;
      const w = Math.sqrt(9.81 * k) * wv.speedScale;
      const phase = dot(vec2(wv.dirX, wv.dirY), p).mul(k).sub(t.mul(w)).add(wv.phase).toVar();
      const s = phase.sin().toVar();
      const c = phase.cos().toVar();
      h = h.add(s.mul(wv.amplitude));
      slopeX = slopeX.add(c.mul(wv.amplitude * k * wv.dirX));
      slopeY = slopeY.add(c.mul(wv.amplitude * k * wv.dirY));
      jacobian = jacobian.add(s.mul(wv.amplitude * k));
    }
    const height = h.toVar();
    const normal = normalize(vec3(slopeX.negate(), slopeY.negate(), 1.0)).toVar();
    const crest = smoothstepN(0.78, 1.45, jacobian).mul(smoothstepN(0.35, 1.65, height)).toVar();
    const grain = fnoiseN(p.mul(0.75).add(vec2(t.mul(0.05), t.mul(0.02)))).mul(0.58)
      .add(fnoiseN(p.mul(2.1).sub(vec2(t.mul(0.08), t.mul(0.04)))).mul(0.42));
    const foam = crest.mul(smoothstepN(0.54, 0.72, grain)).mul(0.8).toVar();
    return { height, normal, foam };
  }

  height(p: Vec2Node, t: FloatNode): FloatNode {
    let h: FloatNode = float(0.0);
    for (let i = 0; i < IFFT_WAVES.length; i++) {
      const wv = IFFT_WAVES[i];
      const k = 6.2831853 / wv.wavelength;
      const w = Math.sqrt(9.81 * k) * wv.speedScale;
      const phase = dot(vec2(wv.dirX, wv.dirY), p).mul(k).sub(t.mul(w)).add(wv.phase);
      h = h.add(phase.sin().mul(wv.amplitude));
    }
    return h;
  }

  stats(): SeaDisplacementStats {
    return {
      requested: this.requested,
      source: this.source,
      tier: this.tier,
      fallback: false,
      resolution: IFFT_RESOLUTION,
      cascades: IFFT_CASCADE_COUNT,
      storageBytes: IFFT_STORAGE_BYTES,
    };
  }
}

export function seaDisplacementSourceFromParam(value: string | null | undefined): SeaDisplacementSourceId {
  return value === 'ifft' || value === 'ifft-tsl' ? 'ifft-tsl' : 'gerstner-tsl';
}

export function createSeaDisplacementSource(
  requested: SeaDisplacementSourceId = 'gerstner-tsl',
  device = '',
): SeaDisplacementSource {
  if (requested === 'ifft-tsl') {
    if (isSoftwareAdapter(device)) {
      return new GerstnerSeaSource('ifft-tsl', 'gerstner-tsl-swiftshader-fallback');
    }
    return new IfftSpectralSpikeSeaSource();
  }
  return new GerstnerSeaSource();
}

function isSoftwareAdapter(device: string): boolean {
  return /swiftshader|software|llvmpipe|cpu/i.test(device);
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
  // Depth and agitation ramp on DIFFERENT distances (waterPlanePass battle fs):
  // pale turquoise near the beach → deeper blue offshore; the whole visible sea
  // stays calm, whitecaps only build near the horizon.
  const shoreDist = fragXY.x.sub(spec.shoreX).abs().toVar();
  const depth01 = mix(float(0.30), float(0.80), smoothstepN(0.0, 500.0, shoreDist));
  const agitation = smoothstepN(0.0, 3200.0, shoreDist).toVar();
  // Fragment-stage field sample = the crisp swell normal; flatten toward up as
  // agitation falls (the waterShade renormalization, kept as geometry response).
  const s = displacement.sample(fragXY, frame.time);
  const surfaceNormal = normalize(mix(vec3(0.0, 0.0, 1.0), s.normal, mix(float(0.30), float(1.0), agitation)));
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

function bakeIfftSpectralSpikeWaves(): SpectralWave[] {
  const rng = mulberry32(0x1ff7_5ea);
  const waves: SpectralWave[] = [];
  const windAngle = -0.35 * Math.PI;
  const cascades = [
    { domain: 512, minL: 72, maxL: 340, count: 10, amp: 1.65, spread: 0.55, speed: 0.62 },
    { domain: 176, minL: 18, maxL: 92, count: 12, amp: 0.72, spread: 0.95, speed: 0.82 },
    { domain: 56, minL: 5.5, maxL: 26, count: 12, amp: 0.22, spread: 1.35, speed: 1.05 },
  ];
  for (const cascade of cascades) {
    for (let i = 0; i < cascade.count; i++) {
      const u = (i + 0.37 + rng() * 0.26) / cascade.count;
      const wavelength = cascade.maxL * (cascade.minL / cascade.maxL) ** u;
      const k = 6.2831853 / wavelength;
      const theta = windAngle + (rng() - 0.5) * cascade.spread + (i % 3 - 1) * cascade.spread * 0.22;
      const directional = Math.max(0.08, Math.cos(theta - windAngle)) ** 2.0;
      const jonswap = jonswapWeight(k, 9.5, 3.3);
      const amplitude = cascade.amp * Math.sqrt(jonswap) * directional * (0.72 + 0.56 * rng());
      waves.push({
        dirX: Number(Math.cos(theta).toFixed(4)),
        dirY: Number(Math.sin(theta).toFixed(4)),
        wavelength: Number(wavelength.toFixed(2)),
        amplitude: Number(amplitude.toFixed(3)),
        speedScale: Number((cascade.speed * (0.94 + 0.12 * rng())).toFixed(3)),
        phase: Number((rng() * 6.2831853).toFixed(4)),
      });
    }
  }
  return waves;
}

function jonswapWeight(k: number, windSpeed: number, gamma: number): number {
  const g = 9.81;
  const omega = Math.sqrt(g * k);
  const peakOmega = g / Math.max(1, windSpeed);
  const sigma = omega <= peakOmega ? 0.07 : 0.09;
  const r = Math.exp(-((omega / peakOmega - 1) ** 2) / (2 * sigma * sigma));
  const alpha = 0.0081;
  const spectrum = alpha * g * g * omega ** -5 * Math.exp(-1.25 * (peakOmega / omega) ** 4) * gamma ** r;
  return Math.max(0.0001, Math.min(1.0, spectrum * 0.34));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
