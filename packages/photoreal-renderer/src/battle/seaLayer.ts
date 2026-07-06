// seaLayer — the ONE water seam of the photoreal battle world. The sea uses
// the Gerstner TSL displacement source selected by the 12a verdict, shaded as
// a standard material so Fresnel reflection and GGX sun glint come from the
// same SkyModel LUT/IBL and sun that light the rest of the scene. Distance
// haze comes ONLY from the shared aerial-perspective hook (scene.fogNode,
// slice 10b) — the sea dissolves into the sky through it, never through an
// inline haze mix.
import * as THREE from "three/webgpu";
import {
  dot,
  float,
  length,
  mix,
  normalize,
  transformNormalToView,
  varying,
  vec2,
  vec3,
  vec4,
  max,
} from "three/tsl";
import { attribute } from "three/tsl";
import { bakeGerstnerWaves } from "../../../game-renderer/src/water/gerstnerField";
import {
  BATTLE_OCEAN_RAMP,
  FIELD_WATER_RAMP,
  type WaterShoreRamp,
} from "../../../game-renderer/src/water/waterShoreRamp";
import type { BattleOceanPlaneSpec } from "../../../game-renderer/src/battle/horizonPass";
import type { BattleTerrainGrid } from "../../../game-renderer/src/battle/terrainFeatures";
import {
  fnoiseN,
  linearAlbedo,
  rgbNode,
  saturateN,
  smoothstepN,
  type BattleFrameUniforms,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
} from "./battleTsl";

// The neutral scattering colour the sea contributes beneath its sky reflection.
// These are display-authored effective albedos: pale Aegean turquoise in the
// shallows and a restrained deep-water blue offshore under the golden preset.
const WATER_SHALLOW_ALBEDO: [number, number, number] = [0.22, 0.58, 0.6];
const WATER_DEEP_ALBEDO: [number, number, number] = [0.025, 0.095, 0.22];
const WATER_FOAM_ALBEDO: [number, number, number] = [0.92, 0.93, 0.94];
const WATER_SAND_TURBIDITY_ALBEDO: [number, number, number] = [0.66, 0.58, 0.4];
// Calm water is glossy: the sun track is standard-material GGX specular from
// the live environment sun; foam stays matte.
const WATER_ROUGHNESS = 0.105;
const WATER_FOAM_ROUGHNESS = 0.78;
// 12b trap: the sea looked right nearby but sparkled like aliasing in the
// grazing upper band. Fade normal detail with distance from the battle focus;
// aerial haze remains owned by scene.fogNode.
const SEA_NORMAL_DETAIL_NEAR = 0.84;
const SEA_NORMAL_DETAIL_FAR = 0.18;
const SEA_NORMAL_DETAIL_FADE_START = 720;
const SEA_NORMAL_DETAIL_FADE_END = 2300;
const SEA_GLINT_HOT_LUMA_THRESHOLD = 246;
const SEA_GLINT_HOT_FRACTION_MAX = 0.07;
const SEA_GLINT_CENTER_SHARE_MIN = 0.6;
const SEA_SURFACE_OWNER = "skyModel-ibl-standard-pbr" as const;
// Sea state — David's register call (2026-07-02): calm Aegean, waves present
// but not choppy, and battle water sits near shore. One knob scales every
// wave amplitude (photoreal sea only; the shared bespoke baker is untouched).
// Foam height thresholds scale with it so whitecap coverage stays consistent.
const SEA_SWELL_SCALE = 0.55;
const SEA_FOAM_HEIGHT_START = 0.52 * SEA_SWELL_SCALE;
const SEA_FOAM_HEIGHT_END = 1.55 * SEA_SWELL_SCALE;
const SEA_FOAM_SLOPE_START = 0.12;
const SEA_FOAM_SLOPE_END = 0.58;
const SEA_FOAM_SPECKLE_START = 0.56;
const SEA_FOAM_SPECKLE_END = 0.78;
const SEA_FOAM_SCALE = 0.74;
const SEA_SAND_TURBIDITY_DEPTH_START = 0.04;
const SEA_SAND_TURBIDITY_DEPTH_END = 0.26;
const LAKE_SHORE_RAMP: WaterShoreRamp = { depthNear: 2, depthFar: 90, hazeNear: 160, hazeFar: 900 };
// 0.035 z-fought the ground at vista distance (cobblestone mosaic - compose
// rounds 1-2); 0.3 stays visually seated and clears depth precision.
const LAKE_SURFACE_LIFT_M = 0.3;
const LAKE_SWELL_SCALE = 0.035;
// Enough ripple normal to break the sun disk - at ocean-glint smoothness a
// becalmed lake becomes a mirror and renders as a blown-white patch.
const LAKE_NORMAL_STRENGTH = 0.42;
const LAKE_NORMAL_DETAIL_FAR = 0.08;
// Ripple normals must be GONE well before vista range: sun-glint facets
// alias into blue/white cobblestone blobs at ~600m (compose rounds 1-2).
const LAKE_NORMAL_DETAIL_FADE_START = 120;
const LAKE_NORMAL_DETAIL_FADE_END = 420;
const FIELD_WATER_DETAIL_FADE_START = LAKE_NORMAL_DETAIL_FADE_START;
const FIELD_WATER_DETAIL_FADE_END = LAKE_NORMAL_DETAIL_FADE_END;
const WATER_TINT = 1;

export interface BattleLakeSurfaceSpec {
  id: number;
  level: number;
  minCellX: number;
  minCellY: number;
  maxCellX: number;
  maxCellY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cells: number;
}

interface WaterSampleNodes {
  height: FloatNode;
  normal: Vec3Node;
  foam: FloatNode;
}

export type SeaDisplacementSourceId = "gerstner-tsl";
export type SeaDisplacementTier = "gerstner-tsl";

export interface SeaSurfaceStats {
  owner: typeof SEA_SURFACE_OWNER;
  skyReflection: "scene.environment:skyModel-lut";
  sunGlint: "mesh-standard-ggx";
  shallowAlbedo: [number, number, number];
  deepAlbedo: [number, number, number];
  foamAlbedo: [number, number, number];
  sandTurbidityAlbedo: [number, number, number];
  roughness: number;
  foamRoughness: number;
  normalDetail: {
    near: number;
    far: number;
    fadeStart: number;
    fadeEnd: number;
  };
  foam: {
    heightStart: number;
    heightEnd: number;
    slopeStart: number;
    slopeEnd: number;
    speckleStart: number;
    speckleEnd: number;
    scale: number;
  };
  shore: {
    ramp: WaterShoreRamp;
    sandTurbidityDepthStart: number;
    sandTurbidityDepthEnd: number;
    heightfieldDatum: true;
    farExtent: number;
  };
  glint: {
    roughnessFloor: number;
    normalDetailCeiling: number;
    hotLumaThreshold: number;
    hotFractionMax: number;
    centerShareMin: number;
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
  readonly source = "gerstner-tsl" as const;
  readonly requested: SeaDisplacementSourceId;
  readonly tier: SeaDisplacementTier;

  constructor(
    requested: SeaDisplacementSourceId = "gerstner-tsl",
    tier: SeaDisplacementTier = "gerstner-tsl",
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

export function seaDisplacementSourceFromParam(
  value: string | null | undefined,
): SeaDisplacementSourceId {
  const normalized = value === "gerstner" || value === "gerstner-tsl" ? value : "gerstner-tsl";
  return normalized === "gerstner" ? "gerstner-tsl" : normalized;
}

export function createSeaDisplacementSource(
  requested: SeaDisplacementSourceId = "gerstner-tsl",
): SeaDisplacementSource {
  return new GerstnerSeaSource(requested);
}

export function seaSurfaceStats(): SeaSurfaceStats {
  return {
    owner: SEA_SURFACE_OWNER,
    skyReflection: "scene.environment:skyModel-lut",
    sunGlint: "mesh-standard-ggx",
    shallowAlbedo: WATER_SHALLOW_ALBEDO,
    deepAlbedo: WATER_DEEP_ALBEDO,
    foamAlbedo: WATER_FOAM_ALBEDO,
    sandTurbidityAlbedo: WATER_SAND_TURBIDITY_ALBEDO,
    roughness: WATER_ROUGHNESS,
    foamRoughness: WATER_FOAM_ROUGHNESS,
    normalDetail: {
      near: SEA_NORMAL_DETAIL_NEAR,
      far: SEA_NORMAL_DETAIL_FAR,
      fadeStart: SEA_NORMAL_DETAIL_FADE_START,
      fadeEnd: SEA_NORMAL_DETAIL_FADE_END,
    },
    foam: {
      heightStart: SEA_FOAM_HEIGHT_START,
      heightEnd: SEA_FOAM_HEIGHT_END,
      slopeStart: SEA_FOAM_SLOPE_START,
      slopeEnd: SEA_FOAM_SLOPE_END,
      speckleStart: SEA_FOAM_SPECKLE_START,
      speckleEnd: SEA_FOAM_SPECKLE_END,
      scale: SEA_FOAM_SCALE,
    },
    shore: {
      ramp: BATTLE_OCEAN_RAMP,
      sandTurbidityDepthStart: SEA_SAND_TURBIDITY_DEPTH_START,
      sandTurbidityDepthEnd: SEA_SAND_TURBIDITY_DEPTH_END,
      heightfieldDatum: true,
      farExtent: 7200,
    },
    glint: {
      roughnessFloor: WATER_ROUGHNESS,
      normalDetailCeiling: SEA_NORMAL_DETAIL_NEAR,
      hotLumaThreshold: SEA_GLINT_HOT_LUMA_THRESHOLD,
      hotFractionMax: SEA_GLINT_HOT_FRACTION_MAX,
      centerShareMin: SEA_GLINT_CENTER_SHARE_MIN,
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
    const phase = dot(vec2(wv.dirX, wv.dirY), p)
      .mul(k)
      .sub(t.mul(w * 0.42))
      .add(ph0)
      .toVar();
    const s = phase.sin().toVar();
    const c = phase.cos().toVar();
    const hump = s.mul(0.5).add(0.5).toVar(); // 0..1 wave profile
    const sharp = hump.mul(hump); // narrow peaks, wide flat troughs
    h = h.add(sharp.sub(0.333).mul(wv.amplitude * SEA_SWELL_SCALE));
    const dHump = hump.mul(c); // d(sharp)/d(phase)
    const dphase = dHump.mul(wv.amplitude * SEA_SWELL_SCALE * 2.0 * k).toVar();
    slopeX = slopeX.add(dphase.mul(wv.dirX));
    slopeY = slopeY.add(dphase.mul(wv.dirY));
  }
  const height = h.toVar();
  const normal = normalize(vec3(slopeX.negate(), slopeY.negate(), 1.0)).toVar();
  // Whitecaps are crest/agitation driven: high wave tops only foam where the
  // local slope is stressed, then fnoise breaks the cover into spray flecks.
  const crest = smoothstepN(SEA_FOAM_HEIGHT_START, SEA_FOAM_HEIGHT_END, height);
  const slopeEnergy = slopeX.mul(slopeX).add(slopeY.mul(slopeY)).toVar();
  const agitation = smoothstepN(SEA_FOAM_SLOPE_START, SEA_FOAM_SLOPE_END, slopeEnergy);
  const speckle = fnoiseN(p.mul(0.5).add(vec2(t.mul(0.1), t.mul(0.05))))
    .mul(0.42)
    .add(fnoiseN(p.mul(1.3).sub(vec2(t.mul(0.06), t.mul(0.09)))).mul(0.34))
    .add(fnoiseN(p.mul(3.0).add(vec2(t.mul(0.04), t.mul(-0.07)))).mul(0.24));
  const foam = crest
    .mul(agitation)
    .mul(smoothstepN(SEA_FOAM_SPECKLE_START, SEA_FOAM_SPECKLE_END, speckle))
    .mul(SEA_FOAM_SCALE)
    .toVar();
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
    const phase = dot(vec2(wv.dirX, wv.dirY), p)
      .mul(k)
      .sub(t.mul(w * 0.42))
      .add(ph0);
    const hump = phase.sin().mul(0.5).add(0.5).toVar();
    h = h.add(
      hump
        .mul(hump)
        .sub(0.333)
        .mul(wv.amplitude * SEA_SWELL_SCALE),
    );
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
  shoreTurbidity: FloatNode | null = null,
): WaterSurfaceNodes {
  const foam = saturateN(foamRaw).toVar();
  const shallow = shoreTurbidity
    ? mix(rgbNode(WATER_SAND_TURBIDITY_ALBEDO), rgbNode(WATER_SHALLOW_ALBEDO), shoreTurbidity)
    : rgbNode(WATER_SHALLOW_ALBEDO);
  let albedo = mix(shallow, rgbNode(WATER_DEEP_ALBEDO), depth01);
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
  const viewDist = length(p.sub(vec2(frame.focus))).toVar();
  const detailFade = smoothstepN(
    FIELD_WATER_DETAIL_FADE_START,
    FIELD_WATER_DETAIL_FADE_END,
    viewDist,
  );
  const detail = float(1.0).sub(detailFade).toVar();
  const lace = fnoiseN(p.mul(1.2).add(vec2(frame.time.mul(0.05), 0.0)))
    .mul(0.28)
    .add(0.72);
  return waterSurfaceNodes(
    shoreDepthNode(FIELD_WATER_RAMP, shoreDist),
    swash.mul(lace).mul(0.7).mul(detail),
  );
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
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide, metalness: 0 });
  const worldXY = attribute<"vec3">("position", "vec3").xy;
  material.positionNode = vec3(worldXY, displacement.height(worldXY, frame.time).add(spec.baseZ));
  const fragXY = varying(worldXY).toVar();
  // Depth and agitation ramp on DIFFERENT distances: pale turquoise near the
  // beach → deeper blue offshore; the visible sea stays calm, whitecaps build
  // only with real swell agitation.
  const shoreDist = fragXY.x.sub(spec.shoreX).abs().toVar();
  const depth01 = shoreDepthNode(BATTLE_OCEAN_RAMP, shoreDist);
  const shoreTurbidity = smoothstepN(
    SEA_SAND_TURBIDITY_DEPTH_START,
    SEA_SAND_TURBIDITY_DEPTH_END,
    depth01,
  );
  const agitation = smoothstepN(0.0, 3200.0, shoreDist).toVar();
  const viewDist = length(fragXY.sub(vec2(frame.focus))).toVar();
  const distanceFade = smoothstepN(
    SEA_NORMAL_DETAIL_FADE_START,
    SEA_NORMAL_DETAIL_FADE_END,
    viewDist,
  ).toVar();
  const detail = mix(
    float(SEA_NORMAL_DETAIL_NEAR),
    float(SEA_NORMAL_DETAIL_FAR),
    distanceFade,
  ).toVar();
  // Fragment-stage field sample = the crisp swell normal. Fade high-frequency
  // normal detail with distance so the grazing band cannot sparkle/moire.
  const s = displacement.sample(fragXY, frame.time);
  const normalStrength = mix(float(0.3), float(1.0), agitation).mul(detail);
  const surfaceNormal = normalize(mix(vec3(0.0, 0.0, 1.0), s.normal, normalStrength));
  material.normalNode = transformNormalToView(surfaceNormal);
  const surface = waterSurfaceNodes(depth01, s.foam.mul(agitation), shoreTurbidity);
  material.colorNode = vec4(surface.albedo, 1.0);
  material.roughnessNode = surface.roughness;

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "battle-ocean-plane";
  mesh.frustumCulled = false;
  return mesh;
}

/** One generated inland lake surface: a flat basin-level patch whose coverage
 *  is clipped to the sim-owned tint=water mask. It shares the sea material
 *  response, but displacement is nearly becalmed so the water reads as a lake. */
export function createLakePlaneMesh(
  frame: BattleFrameUniforms,
  spec: BattleLakeSurfaceSpec,
  grid: BattleTerrainGrid,
  displacement: SeaDisplacementSource = createSeaDisplacementSource(),
): THREE.Mesh | null {
  const mesh = buildLakePlaneGeometry(spec, grid);
  if (!mesh) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute("shoreDist", new THREE.BufferAttribute(mesh.shoreDist, 1));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide, metalness: 0 });
  const worldXY = attribute<"vec3">("position", "vec3").xy;
  material.positionNode = vec3(
    worldXY,
    displacement
      .height(worldXY, frame.time)
      .mul(LAKE_SWELL_SCALE)
      .add(spec.level + LAKE_SURFACE_LIFT_M),
  );
  const fragXY = varying(worldXY).toVar();
  const shoreDist = varying(attribute<"float">("shoreDist", "float")).toVar();
  const depth01 = shoreDepthNode(LAKE_SHORE_RAMP, shoreDist);
  const viewDist = length(fragXY.sub(vec2(frame.focus))).toVar();
  const detailFade = smoothstepN(
    LAKE_NORMAL_DETAIL_FADE_START,
    LAKE_NORMAL_DETAIL_FADE_END,
    viewDist,
  );
  const normalDetail = mix(
    float(LAKE_NORMAL_STRENGTH),
    float(LAKE_NORMAL_DETAIL_FAR),
    detailFade,
  ).toVar();
  const lakeNormal = displacement.sample(fragXY, frame.time).normal;
  const surfaceNormal = normalize(mix(vec3(0.0, 0.0, 1.0), lakeNormal, normalDetail));
  material.normalNode = transformNormalToView(surfaceNormal);
  // Lakes: a NARROW sandy rim only. The wide ocean turbidity regime across a
  // shallow lake body mottles blue/cream cobblestone (compose rounds 1-2);
  // the body floors to a deeper pale read.
  const shoreTurbidity = smoothstepN(0.0, 0.1, depth01);
  const lakeDepth01 = max(depth01, float(0.42));
  const surface = waterSurfaceNodes(lakeDepth01, float(0.0), shoreTurbidity);
  material.colorNode = vec4(surface.albedo, 1.0);
  // Lakes read matte-calm, never ocean-glint smooth (see normal note above).
  material.roughnessNode = max(surface.roughness, float(0.3));

  const lake = new THREE.Mesh(geo, material);
  lake.name = `battle-lake-plane-${spec.id}`;
  lake.frustumCulled = false;
  return lake;
}

function buildLakePlaneGeometry(
  spec: BattleLakeSurfaceSpec,
  grid: BattleTerrainGrid,
): { positions: Float32Array; shoreDist: Float32Array; indices: Uint32Array } | null {
  const minX = Math.max(0, Math.min(grid.w - 1, Math.floor(spec.minCellX)));
  const minY = Math.max(0, Math.min(grid.h - 1, Math.floor(spec.minCellY)));
  const maxX = Math.max(minX, Math.min(grid.w - 1, Math.floor(spec.maxCellX)));
  const maxY = Math.max(minY, Math.min(grid.h - 1, Math.floor(spec.maxCellY)));
  const waterCells: Array<{ cx: number; cy: number; shore: number }> = [];
  const shoreCells = lakeShoreDistanceCells(grid, minX, minY, maxX, maxY);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const i = cy * grid.w + cx;
      if (grid.tint[i] !== WATER_TINT) continue;
      waterCells.push({ cx, cy, shore: (shoreCells.get(i) ?? 0) * grid.cell });
    }
  }
  if (waterCells.length === 0) return null;

  const positions = new Float32Array(waterCells.length * 4 * 3);
  const shoreDist = new Float32Array(waterCells.length * 4);
  const indices = new Uint32Array(waterCells.length * 6);
  let pv = 0;
  let sv = 0;
  let iv = 0;
  for (let n = 0; n < waterCells.length; n++) {
    const { cx, cy, shore } = waterCells[n];
    const x0 = grid.ox + cx * grid.cell;
    const x1 = x0 + grid.cell;
    const y0 = grid.oy + cy * grid.cell;
    const y1 = y0 + grid.cell;
    positions.set(
      [x0, y0, spec.level, x1, y0, spec.level, x0, y1, spec.level, x1, y1, spec.level],
      pv,
    );
    shoreDist.set([shore, shore, shore, shore], sv);
    const b = n * 4;
    indices.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], iv);
    pv += 12;
    sv += 4;
    iv += 6;
  }
  return { positions, shoreDist, indices };
}

function lakeShoreDistanceCells(
  grid: BattleTerrainGrid,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Map<number, number> {
  const dist = new Map<number, number>();
  const queue: number[] = [];
  const push = (i: number, d: number) => {
    if (dist.has(i)) return;
    dist.set(i, d);
    queue.push(i);
  };
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const i = cy * grid.w + cx;
      if (grid.tint[i] !== WATER_TINT) continue;
      if (
        cx === 0 ||
        cy === 0 ||
        cx === grid.w - 1 ||
        cy === grid.h - 1 ||
        grid.tint[i - 1] !== WATER_TINT ||
        grid.tint[i + 1] !== WATER_TINT ||
        grid.tint[i - grid.w] !== WATER_TINT ||
        grid.tint[i + grid.w] !== WATER_TINT
      ) {
        push(i, 0);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const d = dist.get(i) ?? 0;
    const cx = i % grid.w;
    const cy = Math.floor(i / grid.w);
    const neighbors = [
      cx > minX ? i - 1 : -1,
      cx < maxX ? i + 1 : -1,
      cy > minY ? i - grid.w : -1,
      cy < maxY ? i + grid.w : -1,
    ];
    for (const ni of neighbors) {
      if (ni < 0 || grid.tint[ni] !== WATER_TINT || dist.has(ni)) continue;
      push(ni, d + 1);
    }
  }
  return dist;
}

function fract53(x: number): number {
  return x - Math.floor(x);
}
