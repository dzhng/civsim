import { clamp, dot, float, mix, vec2, vec3 } from "three/tsl";
import { MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
import {
  fbmN,
  rgbNode,
  smoothstepN,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
} from "./battleTsl";

/**
 * The single contrast owner for battle turf. These are amplitude/value controls,
 * not palette colors: meadow hue remains owned by meadowPalette.ts.
 */
export const TURF_CONTRAST = {
  ground: {
    driftStrength: 0.12,
    mottleStrength: 0.24,
    minimum: 0.56,
    maximum: 1.36,
  },
  canopy: {
    anchorMix: 0.5,
    anchorChroma: 0.55,
    anchorLift: 1.015,
    anchorWarmth: 0.048,
    valueSpread: 0.14,
    fineSpread: 0.04,
    valueMinimum: 0.88,
    valueMaximum: 1.12,
    mixStrength: 0.42,
  },
  quad: {
    scrubStrength: 0.2,
    default: {
      oliveSpread: 0.6,
      speckleStrength: 0.19,
      dryMixBase: 0.22,
      trampleMix: 0.15,
      stubbleStrength: 0.11,
      darkFleckStrength: 0.23,
      stoneFleckStrength: 0.18,
      dustStrength: 0.14,
    },
    wideDetail: {
      oliveSpread: 0.6,
      speckleStrength: 0.195,
      dryMixBase: 0.2,
      trampleMix: 0.14,
      stubbleStrength: 0.063,
      darkFleckStrength: 0.25,
      stoneFleckStrength: 0.19,
      dustStrength: 0.12,
    },
  },
  edge: {
    noiseScale: 0.22,
    noiseDisplacementMeters: 1.4,
    featherMeters: 1,
    turfSpillStart: 0.24,
    turfSpillEnd: 0.72,
    mudInteriorStartMeters: 1.75,
    mudInteriorEndMeters: 4,
    roadInteriorStartMeters: -0.5,
    roadInteriorEndMeters: 0.5,
    displacementBoundMeters: 2.5,
  },
} as const;

/** Fixed spatial vocabulary; amplitudes and material weights live above. */
export const TURF_SHAPE = {
  ground: {
    driftScale: 0.08,
    mottleScale: 1.1,
  },
  canopy: {
    broadScale: 0.045,
    midScale: 0.14,
    contrastLow: 0.34,
    contrastHigh: 0.66,
    broadWeight: 0.62,
    midWeight: 0.38,
  },
} as const;

/** Compose the shared neutral ground-scale modulation before feature materials. */
export interface GroundDetailOptions {
  coverage?: FloatNode;
}

/** Noise-thresholded ownership for every photoreal mud/road edge. */
export function coverEdgeNoiseNode(world: Vec2Node): FloatNode {
  const edge = TURF_CONTRAST.edge;
  return fbmN(world.mul(edge.noiseScale)).sub(0.5).mul(2);
}

export function coverEdgeNode(
  signedDistanceMeters: FloatNode,
  centeredNoise: FloatNode,
): FloatNode {
  const edge = TURF_CONTRAST.edge;
  return smoothstepN(
    -edge.featherMeters,
    edge.featherMeters,
    signedDistanceMeters.add(centeredNoise.mul(edge.noiseDisplacementMeters)),
  );
}

/** Macro/canopy ownership spills across only the feather, never earth interiors. */
export function turfEdgeCoverageNode(earthCoverage: FloatNode): FloatNode {
  const edge = TURF_CONTRAST.edge;
  return float(1).sub(smoothstepN(edge.turfSpillStart, edge.turfSpillEnd, earthCoverage));
}

/** Churn reads the unwarped mud source, deliberately excluding road and feather. */
export function mudInteriorCoverageNode(mudDistanceMeters: FloatNode): FloatNode {
  const edge = TURF_CONTRAST.edge;
  return smoothstepN(edge.mudInteriorStartMeters, edge.mudInteriorEndMeters, mudDistanceMeters);
}

export function roadInteriorCoverageNode(roadDistanceMeters: FloatNode): FloatNode {
  const edge = TURF_CONTRAST.edge;
  return smoothstepN(edge.roadInteriorStartMeters, edge.roadInteriorEndMeters, roadDistanceMeters);
}

/** CPU mirror used by deterministic width/ownership telemetry. */
export function coverEdgeCoverage(signedDistanceMeters: number, centeredNoise: number): number {
  const edge = TURF_CONTRAST.edge;
  return smoothstep(
    -edge.featherMeters,
    edge.featherMeters,
    signedDistanceMeters + centeredNoise * edge.noiseDisplacementMeters,
  );
}

/** Deterministic CPU mirror of the shader's centered edge noise. */
export function coverEdgeNoise(x: number, y: number): number {
  const scale = TURF_CONTRAST.edge.noiseScale;
  return fbm(x * scale, y * scale) * 2 - 1;
}

/** CPU mirror of the production interior-only churn mask. */
export function mudInteriorCoverage(mudDistanceMeters: number): number {
  const edge = TURF_CONTRAST.edge;
  return smoothstep(edge.mudInteriorStartMeters, edge.mudInteriorEndMeters, mudDistanceMeters);
}

/** Macro ground variation only; real blade geometry owns near turf and the
 * canopy owner carries distance. */
export function groundDetailNode(
  world: Vec2Node,
  color: Vec3Node,
  options: GroundDetailOptions = {},
): Vec3Node {
  const c = TURF_CONTRAST.ground;
  const shape = TURF_SHAPE.ground;
  const drift = fbmN(world.mul(shape.driftScale)).sub(0.5).mul(c.driftStrength);
  const mottle = fbmN(world.mul(shape.mottleScale)).sub(0.5).mul(c.mottleStrength);
  const detail = clamp(drift.add(mottle).add(float(1)), c.minimum, c.maximum);
  return mix(color, color.mul(detail), options.coverage ?? float(1));
}

/** Compose the fixed-hue turf family from already-owned broad/mid signals. */
export function turfCanopyFromSignalsNode(
  broad: FloatNode,
  mid: FloatNode,
  fine: FloatNode,
): Vec3Node {
  const c = TURF_CONTRAST.canopy;
  const shape = TURF_SHAPE.canopy;
  const canopy = smoothstepN(
    shape.contrastLow,
    shape.contrastHigh,
    broad.mul(shape.broadWeight).add(mid.mul(shape.midWeight)),
  );
  const anchor = mix(rgbNode(MEADOW.farGrass.low), rgbNode(MEADOW.farGrass.high), c.anchorMix);
  const neutral = dot(anchor, vec3(0.2126, 0.7152, 0.0722));
  const quietAnchor = mix(vec3(neutral), anchor, c.anchorChroma)
    .mul(c.anchorLift)
    .mul(vec3(1 + c.anchorWarmth, 1, 1 - c.anchorWarmth));
  const value = clamp(
    float(1).add(canopy.sub(0.5).mul(c.valueSpread)).add(fine.sub(0.5).mul(c.fineSpread)),
    c.valueMinimum,
    c.valueMaximum,
  );
  return quietAnchor.mul(value);
}

/** The fixed-hue far-turf family shared by playable and vista ground. */
export function turfCanopyNode(world: Vec2Node, fine: FloatNode): Vec3Node {
  const shape = TURF_SHAPE.canopy;
  const broad = fbmN(world.mul(shape.broadScale).add(vec2(2.5, 7))).toVar();
  const mid = fbmN(world.mul(shape.midScale).add(vec2(6, 1.5))).toVar();
  return turfCanopyFromSignalsNode(broad, mid, fine);
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function fbm(x: number, y: number): number {
  return (
    vnoise(x, y) * 0.52 +
    vnoise(x * 2.11 + 4.3, y * 2.11 + 1.7) * 0.31 +
    vnoise(x * 4.07 + 9.1, y * 4.07 + 6.4) * 0.17
  );
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const lower = lerp(hash(ix, iy), hash(ix + 1, iy), ux);
  const upper = lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux);
  return lerp(lower, upper, uy);
}

function hash(x: number, y: number): number {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = px;
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d;
  py += d;
  pz += d;
  return fract((px + py) * pz);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
