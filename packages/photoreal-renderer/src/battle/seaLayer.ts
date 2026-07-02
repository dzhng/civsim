// seaLayer — the ONE water seam of the photoreal battle world (slice 08a).
// Parity Gerstner-family sea shading: a literal TSL port of the production
// water material stack (gerstnerField waterField → waterShade →
// civsimWaterColor → shore ramps), fed by the SAME baked wave list
// (bakeGerstnerWaves — the wave source of truth) and the SAME ocean-plane
// layout the bespoke horizonPass builds. SCAFFOLD per the README ledger: the
// parity shading dies at 12b–d (photoreal surface); this seam survives.
import * as THREE from 'three/webgpu';
import {
  clamp, dot, float, max, min, mix, normalize, pow, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { attribute } from 'three/tsl';
import { bakeGerstnerWaves } from '../../../game-renderer/src/water/gerstnerField';
import { BATTLE_OCEAN_RAMP, FIELD_WATER_RAMP, type WaterShoreRamp } from '../../../game-renderer/src/water/waterShoreRamp';
import type { BattleOceanPlaneSpec } from '../../../game-renderer/src/battle/horizonPass';
import type { BattleEnvironment } from '../../../game-renderer/src/environment/environment';
import {
  fnoiseN, rgbNode, saturateN, smoothstepN, sunDirectionNode,
  type BattleFrameUniforms, type FloatNode, type Vec2Node, type Vec3Node,
} from './battleTsl';

// waterPalette.ts — the neutral albedo the sea *is*, before any lighting mood.
const WATER_SHALLOW_ALBEDO: [number, number, number] = [0.09, 0.29, 0.40];
const WATER_DEEP_ALBEDO: [number, number, number] = [0.02, 0.07, 0.19];
const WATER_FOAM_ALBEDO: [number, number, number] = [0.92, 0.93, 0.94];
const WATER_GLINT_GAIN = 1.1;
// waterMaterialWgsl.ts — constant surface→camera approximation for the glint.
const WATER_VIEW_DIR: [number, number, number] = [0.0, -0.62, 0.78];

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

/** The one civsim water material (waterMaterialWgsl civsimWaterColor), ported:
 *  every photoreal water surface shades through this function so shorelines
 *  cannot show a stripe. */
export function civsimWaterColorNodes(
  env: BattleEnvironment,
  frame: BattleFrameUniforms,
  p: Vec2Node,
  depth01: FloatNode,
  haze01: FloatNode,
  agitation: FloatNode,
  swash: FloatNode,
): Vec3Node {
  const e = env.environment;
  const s = waterFieldNodes(p, frame.time);
  // Flatten the swell toward up as agitation falls (waterShade renormalises).
  const normal = mix(vec3(0.0, 0.0, 1.0), s.normal, mix(float(0.30), float(1.0), agitation)).toVar();
  const foamRaw = max(s.foam.mul(agitation), swash).toVar();
  const delta = p.sub(vec2(frame.focus)).toVar();
  const sunAzVec = vec2(Math.cos(e.sunAzimuth), Math.sin(e.sunAzimuth));
  const band = smoothstepN(0.1, 0.8, dot(normalize(delta), sunAzVec)).mul(mix(float(0.25), float(1.0), agitation));

  // waterShade, inlined: albedo × preset light + banded glint + lit foam + haze.
  const sunDir = sunDirectionNode(env);
  const key = rgbNode(e.keyColor);
  const fill = rgbNode(e.fillColor);
  const exposure = e.exposure;
  const albedo = mix(rgbNode(WATER_SHALLOW_ALBEDO), rgbNode(WATER_DEEP_ALBEDO), depth01);
  const n = normalize(normal).toVar();
  const diff = saturateN(dot(n, sunDir));
  const sky = saturateN(n.z.mul(0.5).add(0.5));
  const light = key.mul(diff.mul(0.66).add(0.34)).add(fill.mul(sky.mul(0.32).add(0.28)));
  let col = albedo.mul(light).mul(exposure);
  const foam = saturateN(foamRaw).toVar();
  const halfv = normalizeJs([
    sunDirJs(env)[0] + WATER_VIEW_DIR[0],
    sunDirJs(env)[1] + WATER_VIEW_DIR[1],
    sunDirJs(env)[2] + WATER_VIEW_DIR[2],
  ]);
  const facing = saturateN(dot(n, vec3(halfv[0], halfv[1], halfv[2]))).toVar();
  const sparkle = pow(facing, 70.0).mul(1.4);
  const sheen = pow(facing, 6.0).mul(0.5);
  const glint = min(sparkle.add(sheen).mul(band), 1.5)
    .mul(float(1.0).sub(foam.mul(0.5)))
    .mul(float(1.0).sub(haze01));
  col = col.add(key.mul(WATER_GLINT_GAIN).mul(glint));
  const foamLit = rgbNode(WATER_FOAM_ALBEDO).mul(key.mul(0.55).add(fill.mul(0.45))).mul(exposure);
  const surface = mix(col, foamLit, foam);
  return mix(surface, rgbNode(e.hazeColor), clamp(haze01, 0.0, 1.0));
}

/** fieldWaterWgsl fieldWaterColor — the on-field battle water (agitation 0 +
 *  swash lace pinned to the waterline), keyed on the box-filtered water
 *  weight. The ground material blends this over turf by the same weight. */
export function fieldWaterColorNodes(
  env: BattleEnvironment,
  frame: BattleFrameUniforms,
  p: Vec2Node,
  shoreDist: FloatNode,
): Vec3Node {
  const swash = smoothstepN(0.16, 0.02, shoreDist).mul(smoothstepN(0.006, 0.03, shoreDist));
  const lace = fnoiseN(p.mul(1.2).add(vec2(frame.time.mul(0.05), 0.0))).mul(0.28).add(0.72);
  const ramp = shoreRampNodes(FIELD_WATER_RAMP, shoreDist);
  return civsimWaterColorNodes(env, frame, p, ramp.depth01, ramp.haze01, float(0.0), swash.mul(lace).mul(0.7));
}

/** One battle ocean-edge plane (waterPlanePass battle mode): the displaced
 *  grid mesh + the shore-keyed civsimWaterColor material. */
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

  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.fog = false;
  const worldXY = attribute<'vec3'>('position', 'vec3').xy;
  material.positionNode = vec3(worldXY, waterHeightNode(worldXY, frame.time).add(spec.baseZ));
  const fragXY = varying(worldXY).toVar();
  // Depth and agitation ramp on DIFFERENT distances (waterPlanePass battle fs):
  // pale turquoise near the beach → deeper blue offshore; the whole visible sea
  // stays calm and golden, whitecaps only build near the horizon.
  const shoreDist = fragXY.x.sub(spec.shoreX).abs().toVar();
  const depth01 = mix(float(0.30), float(0.80), smoothstepN(0.0, 500.0, shoreDist));
  const agitation = smoothstepN(0.0, 3200.0, shoreDist);
  const haze01 = shoreRampNodes(BATTLE_OCEAN_RAMP, shoreDist).haze01;
  material.colorNode = vec4(civsimWaterColorNodes(env, frame, fragXY, depth01, haze01, agitation, float(0.0)), 1.0);

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'battle-ocean-plane';
  mesh.frustumCulled = false;
  return mesh;
}

function sunDirJs(env: BattleEnvironment): [number, number, number] {
  const az = env.environment.sunAzimuth;
  const el = env.environment.sunElevation;
  return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
}

function normalizeJs(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function fract53(x: number): number {
  return x - Math.floor(x);
}
