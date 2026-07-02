// seaLayer — the ONE water seam of the photoreal battle world (slice 08a).
// Since slice 09 the sea is a standard-material response: the Gerstner-family
// displacement/foam/shore seam survives (fed by the SAME baked wave list —
// bakeGerstnerWaves — and the SAME ocean-plane layout the bespoke horizonPass
// builds), but the surface carries a NEUTRAL albedo + roughness and the sun /
// IBL light it like every other world surface. SCAFFOLD per the README
// ledger: this parity-derived Gerstner shading dies at 12b–d (photoreal
// surface); the seam survives. The haze mix is the 08a aerial stand-in (dies
// at 10b, the one aerial-perspective owner).
import * as THREE from 'three/webgpu';
import {
  dot, float, mix, normalize, transformNormalToView, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { attribute } from 'three/tsl';
import { bakeGerstnerWaves } from '../../../game-renderer/src/water/gerstnerField';
import { BATTLE_OCEAN_RAMP, FIELD_WATER_RAMP, type WaterShoreRamp } from '../../../game-renderer/src/water/waterShoreRamp';
import type { BattleOceanPlaneSpec } from '../../../game-renderer/src/battle/horizonPass';
import type { BattleEnvironment } from '../../../game-renderer/src/environment/environment';
import {
  fnoiseN, linearAlbedo, rgbNode, saturateN, smoothstepN,
  type BattleFrameUniforms, type FloatNode, type Vec2Node, type Vec3Node,
} from './battleTsl';

// waterPalette.ts — the neutral albedo the sea *is*, before any lighting mood.
const WATER_SHALLOW_ALBEDO: [number, number, number] = [0.09, 0.29, 0.40];
const WATER_DEEP_ALBEDO: [number, number, number] = [0.02, 0.07, 0.19];
const WATER_FOAM_ALBEDO: [number, number, number] = [0.92, 0.93, 0.94];
// Calm water is glossy (the sun glint is real GGX specular now); foam and
// hazed distance read matte.
const WATER_ROUGHNESS = 0.14;
const WATER_FOAM_ROUGHNESS = 0.85;
const WATER_HAZE_ROUGHNESS = 0.9;

interface WaterSampleNodes {
  height: FloatNode;
  normal: Vec3Node;
  foam: FloatNode;
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

/** waterShoreRamp(shoreDist) → (depth01, haze01) for a ramp table. */
export function shoreRampNodes(ramp: WaterShoreRamp, shoreDist: FloatNode): { depth01: FloatNode; haze01: FloatNode } {
  return {
    depth01: smoothstepN(ramp.depthNear, ramp.depthFar, shoreDist),
    haze01: smoothstepN(ramp.hazeNear, ramp.hazeFar, shoreDist),
  };
}

export interface WaterSurfaceNodes {
  /** Neutral albedo (depth-graded blue + foam + the 10b-bound haze mix). */
  albedo: Vec3Node;
  foam: FloatNode;
  roughness: FloatNode;
}

/** The one civsim water surface response: every photoreal water surface
 *  (ocean planes, on-field water in the ground material) composes through
 *  this, so shorelines cannot show a stripe. Neutral albedo — the environment
 *  lights it. */
export function waterSurfaceNodes(
  env: BattleEnvironment,
  depth01: FloatNode,
  haze01: FloatNode,
  foamRaw: FloatNode,
): WaterSurfaceNodes {
  const e = env.environment;
  const foam = saturateN(foamRaw).toVar();
  const haze = saturateN(haze01).toVar();
  let albedo = mix(rgbNode(WATER_SHALLOW_ALBEDO), rgbNode(WATER_DEEP_ALBEDO), depth01);
  albedo = mix(albedo, rgbNode(WATER_FOAM_ALBEDO), foam);
  // Aerial stand-in (08a parity ledger — dies at 10b, the ONE aerial owner).
  albedo = mix(albedo, rgbNode(e.hazeColor), haze);
  albedo = linearAlbedo(albedo);
  const roughness = mix(
    mix(float(WATER_ROUGHNESS), float(WATER_FOAM_ROUGHNESS), foam),
    float(WATER_HAZE_ROUGHNESS),
    haze,
  );
  return { albedo, foam, roughness };
}

/** fieldWaterWgsl fieldWaterColor's surface terms — the on-field battle water
 *  (calm: swash lace pinned to the waterline, no swell), keyed on the
 *  box-filtered water weight. The ground material blends these over turf by
 *  the same weight. */
export function fieldWaterSurfaceNodes(
  env: BattleEnvironment,
  frame: BattleFrameUniforms,
  p: Vec2Node,
  shoreDist: FloatNode,
): WaterSurfaceNodes {
  const swash = smoothstepN(0.16, 0.02, shoreDist).mul(smoothstepN(0.006, 0.03, shoreDist));
  const lace = fnoiseN(p.mul(1.2).add(vec2(frame.time.mul(0.05), 0.0))).mul(0.28).add(0.72);
  const ramp = shoreRampNodes(FIELD_WATER_RAMP, shoreDist);
  return waterSurfaceNodes(env, ramp.depth01, ramp.haze01, swash.mul(lace).mul(0.7));
}

/** One battle ocean-edge plane (waterPlanePass battle mode): the displaced
 *  grid mesh + the shore-keyed standard-material water surface. */
export function createOceanPlaneMesh(
  env: BattleEnvironment,
  frame: BattleFrameUniforms,
  spec: BattleOceanPlaneSpec,
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
  material.fog = false;
  const worldXY = attribute<'vec3'>('position', 'vec3').xy;
  material.positionNode = vec3(worldXY, waterHeightNode(worldXY, frame.time).add(spec.baseZ));
  const fragXY = varying(worldXY).toVar();
  // Depth and agitation ramp on DIFFERENT distances (waterPlanePass battle fs):
  // pale turquoise near the beach → deeper blue offshore; the whole visible sea
  // stays calm, whitecaps only build near the horizon.
  const shoreDist = fragXY.x.sub(spec.shoreX).abs().toVar();
  const depth01 = mix(float(0.30), float(0.80), smoothstepN(0.0, 500.0, shoreDist));
  const agitation = smoothstepN(0.0, 3200.0, shoreDist).toVar();
  const haze01 = shoreRampNodes(BATTLE_OCEAN_RAMP, shoreDist).haze01;
  // Fragment-stage field sample = the crisp swell normal; flatten toward up as
  // agitation falls (the waterShade renormalization, kept as geometry response).
  const s = waterFieldNodes(fragXY, frame.time);
  const surfaceNormal = normalize(mix(vec3(0.0, 0.0, 1.0), s.normal, mix(float(0.30), float(1.0), agitation)));
  material.normalNode = transformNormalToView(surfaceNormal);
  const surface = waterSurfaceNodes(env, depth01, haze01, s.foam.mul(agitation));
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
