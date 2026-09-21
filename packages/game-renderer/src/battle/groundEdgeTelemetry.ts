import { smoothstep } from "../../../renderer-core/src/math";
import { TURF_CONTRAST } from "./groundMaterialPolicy";

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
