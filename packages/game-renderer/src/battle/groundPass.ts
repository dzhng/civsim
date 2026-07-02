import type { RawFrameShell, WorldRenderPass } from '../../../renderer-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../renderer-core/src/cameraWgsl';
import { gpuMultisample, gpuOpaqueColorTarget, gpuWorldDepthStencil } from '../../../renderer-core/src/pipelineContracts';
import { compileShader } from '../../../renderer-core/src/compileShader';
import type { BattleGroundCover, BattleTerrainGrid } from './terrainFeatures';
import { terrainHeightAt, type TerrainHeightField } from '../terrain/heightField';
import type { GrassFieldSnapshot } from './grassField';
import { fieldWaterWgsl } from '../water/fieldWaterWgsl';
import {
  BATTLE_ENVIRONMENTS,
  battleEnvironmentStats,
  battleEnvironmentWgsl,
  type BattleEnvironment,
} from '../environment/environment';

// The rolling battle ground: a height-displaced grid mesh that replaces the flat
// terrain quads, so soldiers, shadows, and props (which seat on the same height
// source) sit ON the ground instead of floating over it. Full-field ground cover
// (grass/yellow/scrub/sand) is the base; sim terrain tints layer feature colour
// on top. Lit by the surface normal so the relief reads.

const GROUND_COVER_COLOR: Record<BattleGroundCover, [number, number, number]> = {
  'green-grass': [0.40, 0.49, 0.26],
  'yellow-grass': [0.60, 0.57, 0.31],
  'scrub-grass': [0.52, 0.53, 0.34],
  sand: [0.74, 0.66, 0.46],
};

// Feature tints (sim tint byte → overlay colour); grass (0) keeps the cover.
// Water (tint 1, WATER_TINT) is deliberately absent — it is no longer a flat overlay
// colour but the shared `waterShade` material, keyed per-vertex by the box-filtered
// water weight (the location(3) `water` attribute) and blended in the fs water branch.
const TINT_COLOR: Record<number, [number, number, number]> = {
  2: [0.50, 0.47, 0.42], // rock
  3: [0.55, 0.52, 0.47], // wall
  4: [0.24, 0.34, 0.19], // forest floor
  5: [0.40, 0.33, 0.23], // mud
  6: [0.56, 0.53, 0.45], // scree/rough
};

// The sim tint byte that means water — its cells carry the shared water material.
const WATER_TINT = 1;

// The field-water material is analytic Gerstner (no GPU resources, no bind group)
// evaluated per-fragment on the ground mesh — the mesh z stays the gameplay height
// field, so soldiers and props seat exactly as before. The water WGSL is the shared
// FIELD_WATER_WGSL, single-sourced with the lab terrainPass fixtures and built on
// the same frozen open-sea look as the horizon plane, so all civsim water is one
// material.
const GROUND_WGSL = (env: BattleEnvironment) => `
${WORLD_CAMERA_WGSL}
${battleEnvironmentWgsl(env)}
struct GroundUniform {
  meadow0: vec4f,
  meadow1: vec4f,
  meadow2: vec4f,
  meadow3: vec4f,
  meadow4: vec4f,
  meadow5: vec4f,
};
@group(1) @binding(0) var<uniform> ground: GroundUniform;
@group(1) @binding(1) var meadowSampler: sampler;
@group(1) @binding(2) var meadowTexture: texture_2d<f32>;

${fieldWaterWgsl(env.environment)}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) light: f32,
  @location(2) world: vec2f,
  @location(3) water: f32,
  @location(4) fog: f32,
  @location(5) dist: f32,
};

fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.xyx) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
             mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  return vnoise(p) * 0.52 + vnoise(p * 2.11 + vec2f(4.3, 1.7)) * 0.31 + vnoise(p * 4.07 + vec2f(9.1, 6.4)) * 0.17;
}

fn ridge(p: vec2f) -> f32 {
  let r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  return r * r;
}

fn meadowField(world: vec2f) -> vec4f {
  let size = max(ground.meadow2.zw, vec2f(0.001, 0.001));
  let uv = (world - ground.meadow2.xy) / size;
  let inside = select(0.0, 1.0, uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0);
  return textureSampleLevel(meadowTexture, meadowSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0) * inside;
}

fn meadowWeight(dist: f32, field: vec4f) -> f32 {
  let enabled = ground.meadow0.x;
  let depthT = smoothstep(ground.meadow1.x, ground.meadow1.y, dist);
  let strength = mix(ground.meadow1.z, ground.meadow1.w, depthT);
  let fieldEnabled = ground.meadow0.y;
  let fieldRaw = clamp(field.r * ground.meadow0.z, 0.0, 1.0);
  let fieldCoverageRaw = clamp(field.g * max(1.0, ground.meadow0.z * 0.72), 0.0, 1.0);
  let fieldMass = smoothstep(0.018, 0.86, max(fieldRaw * 0.72, fieldCoverageRaw));
  let fieldFloor = clamp(ground.meadow3.w, 0.0, 1.0);
  let fieldBlend = clamp(fieldFloor + fieldMass * (1.0 - fieldFloor), 0.0, 1.0);
  return enabled * strength * mix(1.0, fieldBlend, fieldEnabled);
}

fn meadowCarpet(world: vec2f, dist: f32, field: vec4f, screen: vec2f) -> vec3f {
  let depthT = smoothstep(ground.meadow1.x, ground.meadow1.y, dist);
  let nearT = 1.0 - depthT;
  let fieldEnabled = ground.meadow0.y;
  let fieldRaw = clamp(field.r * ground.meadow0.z, 0.0, 1.0);
  let fieldCoverageRaw = clamp(field.g * max(1.0, ground.meadow0.z * 0.72), 0.0, 1.0);
  let fieldCoverage = smoothstep(0.018, 0.82, fieldCoverageRaw);
  let fieldMass = smoothstep(0.012, 0.78, fieldRaw);
  let fieldFloor = clamp(ground.meadow3.w, 0.0, 1.0);
  let fieldDetailPresence = fieldEnabled * smoothstep(0.020, 0.56, fieldCoverageRaw);
  let rawDetailPresence = fieldEnabled * smoothstep(0.010, 0.48, fieldRaw);
  let fieldPresence = clamp(fieldDetailPresence + fieldFloor * fieldEnabled, 0.0, 1.0);
  let floorPresence = fieldFloor * fieldEnabled * (1.0 - fieldDetailPresence * 0.55);
  let directionalDetail = 1.0 - fieldEnabled * 0.88;
  let rootMassField = clamp(field.b, 0.0, 1.0);
  let fieldPhase = clamp(field.a, 0.0, 1.0);
  let rootMassEnabled = clamp(ground.meadow3.x, 0.0, 1.0);
  let rootMassStrength = clamp(ground.meadow3.y, 0.0, 2.0);
  let rootMassContrast = clamp(ground.meadow3.z, 0.25, 2.0);
  let bodyDomainEnabled = clamp(ground.meadow4.x, 0.0, 1.0);
  let bodyDomainStrength = clamp(ground.meadow4.y, 0.0, 2.0);
  let bodyDomainScale = max(0.01, ground.meadow4.z);
  let bodyDomainContrast = clamp(ground.meadow4.w, 0.35, 2.5);
  let bodyDomainMode = ground.meadow5.x;
  let bodyDomainFrequency = max(0.01, ground.meadow5.y);
  let continuousBodyDomain = step(0.5, bodyDomainMode);
  let fieldClump = rootMassField * rootMassEnabled;
  let rootMassRaw = pow(rootMassField, rootMassContrast);
  let rootMass = smoothstep(0.035, 0.72, rootMassRaw) * rootMassEnabled * fieldEnabled;
  let rootMassNear = rootMass * (0.72 + nearT * 0.46);
  let proceduralDir = normalize(vec2f(0.94, 0.34));
  let flowDir = normalize(proceduralDir + vec2f((fieldPhase - 0.5) * 0.08, (fieldClump - 0.5) * 0.05) * fieldDetailPresence);
  let crossDir = vec2f(-flowDir.y, flowDir.x);
  let along = dot(world, flowDir);
  let across = dot(world, crossDir);
  let warp = vec2f(
    fbm(world * 0.012 + vec2f(13.0, 2.0)) - 0.5,
    fbm(world * 0.014 + vec2f(5.0, 17.0)) - 0.5
  );
  let fieldWarp = vec2f(
    fbm(world * 0.032 + vec2f(fieldPhase * 3.1, field.r * 4.7)) - 0.5,
    fbm(world * 0.038 + vec2f(fieldClump * 3.7, field.g * 4.3)) - 0.5
  );
  let broad = fbm(world * 0.026 + warp * 3.4 + vec2f(2.0, 9.0));
  let clump = fbm(world * 0.072 + warp * 5.0 + vec2f(11.0, 4.0));
  let under = fbm(world * 0.145 + warp * 4.4 + vec2f(6.0, 3.0));
  let brushed = ridge(vec2f(
    along * 0.128 + warp.x * 2.2,
    across * 0.040 + broad * 1.1
  ));
  let felt = ridge(vec2f(
    along * 0.330 + warp.x * 3.8,
    across * 0.105 + warp.y * 2.6
  ));
  let fieldStreak = ridge(vec2f(
    along * 0.092 + warp.x * 4.0 + fieldPhase * 2.0,
    across * 0.060 + broad * 1.5 + warp.y * 2.1
  ));
  let fieldFiberA = fbm(world * 0.118 + fieldWarp * 3.6 + vec2f(fieldPhase * 2.7, field.r * 2.1));
  let fieldFiberB = ridge(world * 0.130 + fieldWarp * 2.8 + vec2f(clump * 1.7, broad * 1.3));
  let fieldGrain = fbm(world * 0.340 + fieldWarp * 5.8 + vec2f(fieldPhase * 6.1, field.r * 4.9));
  let fieldFine = fbm(world * 0.720 + fieldWarp * 8.0 + vec2f(fieldCoverageRaw * 5.3, fieldClump * 4.1));
  let fieldThatch = fbm(world * 1.180 + fieldWarp * 11.0 + vec2f(fieldPhase * 7.7, field.r * 8.3));
  let fieldNeedle = ridge(world * 1.920 + fieldWarp * 13.0 + vec2f(fieldCoverageRaw * 9.1, fieldClump * 8.7));
  let fieldPatch = fbm(world * 0.050 + fieldWarp * 3.0 + vec2f(field.r * 5.1 + fieldPhase * 2.3, fieldClump * 3.7 + field.g * 2.1));
  let volumeMottle = fbm(world * 0.190 + fieldWarp * 5.6 + vec2f(fieldPhase * 5.9, fieldClump * 4.7));
  let volumeFine = fbm(world * 0.470 + fieldWarp * 7.2 + vec2f(fieldCoverageRaw * 7.1, field.r * 5.2));
  let liftPatch = smoothstep(0.50, 0.78, volumeMottle * 0.64 + volumeFine * 0.36);
  let shadowPocket = smoothstep(0.18, 0.46, volumeMottle * 0.58 + volumeFine * 0.42);
  let fieldFiber = fieldFiberA * 0.22 + fieldFiberB * 0.18 + fieldPatch * 0.22 + fieldGrain * 0.18 + fieldFine * 0.10 + fieldThatch * 0.06 + fieldNeedle * 0.04;
  let fieldGrainLift = smoothstep(0.53, 0.82, fieldGrain * 0.62 + fieldFine * 0.38);
  let fieldGrainShadow = smoothstep(0.18, 0.45, fieldGrain * 0.58 + fieldFine * 0.42);
  let fieldThatchLift = smoothstep(0.52, 0.86, fieldThatch * 0.58 + fieldNeedle * 0.42);
  let fieldThatchShadow = smoothstep(0.14, 0.42, fieldThatch * 0.50 + fieldNeedle * 0.50);
  let floorMottle = fbm(world * 0.092 + warp * 4.8 + vec2f(3.0, 12.0));
  let floorFine = fbm(world * 0.210 + warp * 5.4 + vec2f(17.0, 8.0));
  let floorLift = smoothstep(0.56, 0.82, floorMottle * 0.62 + floorFine * 0.38);
  let floorShadow = smoothstep(0.18, 0.44, floorMottle * 0.58 + floorFine * 0.42);
  let screenWarp = vec2f(
    fbm(world * 0.022 + vec2f(19.0, 7.0)) - 0.5,
    fbm(world * 0.028 + vec2f(4.0, 23.0)) - 0.5
  );
  let screenFiberA = fbm(screen * 0.115 + screenWarp * 7.0 + vec2f(fieldPhase * 5.0, field.r * 7.0));
  let screenFiberB = ridge(screen * 0.155 + screenWarp * 9.0 + vec2f(field.g * 8.0, fieldClump * 6.0));
  let screenFiber = screenFiberA * 0.62 + screenFiberB * 0.38;
  let screenFiberLift = smoothstep(0.58, 0.86, screenFiber);
  let screenFiberShadow = smoothstep(0.16, 0.42, screenFiber);
  let rootMatWarp = vec2f(
    fbm(world * 0.064 + vec2f(fieldPhase * 4.9, fieldClump * 2.8)) - 0.5,
    fbm(world * 0.083 + vec2f(fieldClump * 5.7, fieldPhase * 3.4)) - 0.5
  );
  let rootFelt = fbm(world * 0.245 + rootMatWarp * 5.4 + vec2f(fieldPhase * 6.2, fieldRaw * 2.9));
  let rootFuzz = ridge(vec2f(
    along * 0.410 + rootMatWarp.x * 3.8 + fieldPhase * 2.2,
    across * 0.235 + rootMatWarp.y * 3.2 + fieldClump * 1.9
  ));
  let rootBreakup = fbm(world * 0.620 + rootMatWarp * 8.0 + vec2f(fieldCoverageRaw * 4.1, fieldClump * 6.3));
  let rootVelvet = smoothstep(0.26, 0.82, rootFelt * 0.52 + rootBreakup * 0.48);
  let rootThread = smoothstep(0.46, 0.88, rootFuzz * 0.60 + rootBreakup * 0.40);
  let bodyDomainCoverage = pow(smoothstep(0.030, 0.72, max(fieldCoverageRaw, max(rootMassField * 0.64, fieldRaw * 0.72))), bodyDomainContrast);
  let bodyDomainPresence = bodyDomainEnabled * bodyDomainCoverage * (0.66 + nearT * 0.48);
  let bodyWarp = vec2f(
    fbm(world * 0.052 + vec2f(fieldPhase * 4.3, fieldCoverageRaw * 3.1)) - 0.5,
    fbm(world * 0.071 + vec2f(fieldClump * 4.7, fieldPhase * 3.3)) - 0.5
  );
  let bodyStrandA = ridge(vec2f(
    along * bodyDomainScale + bodyWarp.x * 4.0 + fieldPhase * 2.3,
    across * bodyDomainScale * 0.22 + bodyWarp.y * 2.6 + fieldClump * 1.7
  ));
  let bodyStrandB = ridge(vec2f(
    along * bodyDomainScale * 1.74 + bodyWarp.x * 5.7 + fieldCoverageRaw * 3.2,
    across * bodyDomainScale * 0.36 + bodyWarp.y * 3.5 + fieldPhase * 2.1
  ));
  let bodyStrandFine = fbm(world * (bodyDomainScale * 0.92) + bodyWarp * 6.8 + vec2f(fieldPhase * 6.1, fieldClump * 4.9));
  let bodyStrands = bodyStrandA * 0.46 + bodyStrandB * 0.34 + bodyStrandFine * 0.20;
  let bodyLift = smoothstep(0.48, 0.84, bodyStrands);
  let bodyShadow = smoothstep(0.10, 0.38, bodyStrands);
  let napWarp = vec2f(
    fbm(world * 0.180 + vec2f(fieldPhase * 9.3, fieldCoverageRaw * 6.1)) - 0.5,
    fbm(world * 0.230 + vec2f(fieldClump * 8.7, fieldPhase * 6.3)) - 0.5
  );
  let napA = ridge(vec2f(
    along * bodyDomainFrequency + napWarp.x * 7.4 + fieldPhase * 5.1,
    across * bodyDomainFrequency * 0.075 + napWarp.y * 4.0 + fieldClump * 2.8
  ));
  let napB = ridge(vec2f(
    along * bodyDomainFrequency * 1.67 + napWarp.x * 8.6 + fieldCoverageRaw * 6.2,
    across * bodyDomainFrequency * 0.120 + napWarp.y * 5.2 + fieldPhase * 4.1
  ));
  let napFine = fbm(world * (bodyDomainFrequency * 0.92) + napWarp * 8.8 + vec2f(fieldPhase * 8.7, fieldClump * 7.9));
  let screenNap = ridge(screen * vec2f(0.170, 0.036) + napWarp * 11.0 + vec2f(fieldPhase * 7.0, fieldClump * 5.0));
  let continuousNap = napA * 0.36 + napB * 0.28 + napFine * 0.22 + screenNap * 0.14;
  let continuousLift = smoothstep(0.50, 0.82, continuousNap);
  let continuousShadow = smoothstep(0.12, 0.40, continuousNap);
  let fieldTone = fieldRaw - 0.48;
  let fieldClumpWeight = smoothstep(0.08, 0.82, fieldClump);
  let mat = mix(smoothstep(0.30, 0.78, broad), fieldCoverage, fieldDetailPresence * 0.82);
  let shadowClump = mix(smoothstep(0.48, 0.84, clump), fieldClumpWeight, fieldDetailPresence * 0.58);
  let rootPocket = mix(smoothstep(0.56, 0.88, under), smoothstep(0.14, 0.78, fieldClump * fieldRaw), rawDetailPresence * 0.52);
  let root = vec3f(0.42, 0.51, 0.37);
  let rootMat = vec3f(0.36, 0.46, 0.30);
  let rootThreadTone = vec3f(0.49, 0.57, 0.37);
  let body = vec3f(0.61, 0.67, 0.52);
  let lift = vec3f(0.73, 0.76, 0.62);
  let shadow = vec3f(0.32, 0.43, 0.30);
  var col = mix(body, lift, mat * 0.12 + brushed * directionalDetail * (0.035 + nearT * 0.020));
  col = mix(col, shadow, shadowClump * (0.18 + nearT * 0.22));
  col = mix(col, root, rootPocket * (0.12 + nearT * 0.12));
  col = mix(col, rootMat, rootMassNear * rootMassStrength * (0.18 + nearT * 0.18));
  col = mix(col, shadow, rootMassNear * rootMassStrength * (1.0 - rootVelvet) * (0.08 + nearT * 0.09));
  col = mix(col, rootThreadTone, rootMassNear * rootMassStrength * rootThread * (0.06 + nearT * 0.055));
  col = mix(col, lift, felt * directionalDetail * (0.020 + nearT * 0.025));
  col = mix(col, shadow, (1.0 - mat) * (0.05 + nearT * 0.06));
  col = mix(col, lift, floorLift * floorPresence * (0.050 + nearT * 0.036));
  col = mix(col, shadow, floorShadow * floorPresence * (0.056 + nearT * 0.042));
  col = mix(col, lift, liftPatch * fieldDetailPresence * (0.090 + nearT * 0.080));
  col = mix(col, shadow, shadowPocket * rawDetailPresence * (0.085 + nearT * 0.080));
  col = mix(col, lift, max(fieldTone, 0.0) * fieldDetailPresence * (0.22 + nearT * 0.10));
  col = mix(col, shadow, max(-fieldTone, 0.0) * fieldDetailPresence * (0.26 + nearT * 0.10));
  col = mix(col, lift, fieldStreak * fieldDetailPresence * ground.meadow0.w * (0.006 + nearT * 0.005));
  col = mix(col, lift, fieldFiber * fieldDetailPresence * (0.070 + nearT * 0.060));
  col = mix(col, shadow, (1.0 - fieldFiber) * fieldDetailPresence * (0.030 + nearT * 0.026));
  col = mix(col, lift, fieldGrainLift * fieldDetailPresence * (0.045 + nearT * 0.040));
  col = mix(col, shadow, fieldGrainShadow * fieldDetailPresence * (0.045 + nearT * 0.038));
  col = mix(col, lift, fieldThatchLift * fieldDetailPresence * (0.055 + nearT * 0.052));
  col = mix(col, shadow, fieldThatchShadow * fieldDetailPresence * (0.050 + nearT * 0.046));
  col = mix(col, lift, screenFiberLift * fieldPresence * (0.026 + nearT * 0.028));
  col = mix(col, shadow, screenFiberShadow * fieldPresence * (0.026 + nearT * 0.028));
  col = mix(col, vec3f(0.57, 0.65, 0.46), bodyDomainPresence * bodyDomainStrength * (1.0 - continuousBodyDomain) * (0.16 + nearT * 0.10));
  col = mix(col, lift, bodyLift * bodyDomainPresence * bodyDomainStrength * (1.0 - continuousBodyDomain) * (0.10 + nearT * 0.09));
  col = mix(col, shadow, bodyShadow * bodyDomainPresence * bodyDomainStrength * (1.0 - continuousBodyDomain) * (0.095 + nearT * 0.085));
  col = mix(col, vec3f(0.55, 0.63, 0.46), bodyDomainPresence * bodyDomainStrength * continuousBodyDomain * (0.10 + nearT * 0.08));
  col = mix(col, lift, continuousLift * bodyDomainPresence * bodyDomainStrength * continuousBodyDomain * (0.15 + nearT * 0.16));
  col = mix(col, shadow, continuousShadow * bodyDomainPresence * bodyDomainStrength * continuousBodyDomain * (0.13 + nearT * 0.15));
  col = mix(col, lift, smoothstep(0.54, 0.82, fieldPatch) * fieldDetailPresence * (0.070 + nearT * 0.050));
  col = mix(col, shadow, smoothstep(0.18, 0.42, fieldPatch) * fieldDetailPresence * (0.060 + nearT * 0.055));
  col = mix(col, shadow, (1.0 - fieldMass) * fieldDetailPresence * (0.11 + nearT * 0.07));
  col = mix(col, vec3f(0.54, 0.63, 0.45), fieldMass * fieldPresence * (0.090 + nearT * 0.055));
  col = mix(col, vec3f(0.64, 0.70, 0.62), depthT * 0.20);
  return col;
}

@vertex
fn vs(@location(0) world: vec3f, @location(1) normal: vec3f, @location(2) color: vec3f, @location(3) water: f32) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(world);
  let sun = sunDirection();
  out.light = clamp(dot(normalize(normal), sun) * 0.45 + 0.74, 0.5, 1.18);
  out.color = color;
  out.world = world.xy;
  // The legacy chart "depth" axis (see chartDepthDist) — the key the fog and
  // meadow depth ramps were tuned against; kept value-identical to the blessed
  // battle baselines through the projector collapse.
  let dist = chartDepthDist(world.xy);
  out.dist = dist;
  out.fog = smoothstep(720.0, 1850.0, dist) * 0.52;
  out.water = water;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  // Grass/ground micro-detail across scales: a gentle large drift, a mid mottle,
  // and high-frequency blade speckle so the surface reads as textured ground at
  // the gameplay camera rather than a soft wash.
  let drift = (fbm(in.world * 0.08) - 0.5) * 0.10;
  let mottle = (fbm(in.world * 1.1) - 0.5) * 0.13;
  let blade = (fbm(in.world * 4.7) - 0.5) * 0.10 + (fbm(in.world * 12.0) - 0.5) * 0.06;
  let detail = clamp(1.0 + drift + mottle + blade, 0.68, 1.32);
  let grade = mix(BATTLE_FILL, BATTLE_KEY, clamp((in.light - 0.5) / 0.68, 0.0, 1.0));
  var col = in.color * detail * in.light * grade * BATTLE_EXPOSURE;
  let meadowFieldData = meadowField(in.world);
  let meadow = meadowWeight(in.dist, meadowFieldData);
  let meadowDepthT = smoothstep(ground.meadow1.x, ground.meadow1.y, in.dist);
  let meadowLight = mix(1.00, in.light, 0.24 + meadowDepthT * 0.18);
  let meadowCol = meadowCarpet(in.world, in.dist, meadowFieldData, in.pos.xy) * meadowLight * vec3f(0.94, 0.94, 0.98) * BATTLE_EXPOSURE;
  col = mix(col, meadowCol, meadow);
  // Churn: where the ground is earthy (brown, r over g) the mud reads as trodden,
  // broken ground — a patchy dried crust over darker hollows, scored by
  // directional drag ruts — rather than a smooth, uniform stain.
  // Mud is both BROWN (r over g) and DARK; bright yellow/scrub grass is also
  // warm (r over g) but light, so key on brown AND dark to churn trodden mud
  // without cracking the dry grass cover.
  let brown = smoothstep(0.0, 0.05, in.color.r - in.color.g);
  let dark = 1.0 - smoothstep(0.30, 0.46, (in.color.r + in.color.g + in.color.b) / 3.0);
  let earth = brown * dark;
  // Clods at a coarse scale (so individual patches read as broken ground at the
  // gameplay camera, not sub-pixel speckle that averages back to a flat wash),
  // scored by long directional drag ruts.
  let clods = fbm(in.world * 0.07) * 0.6 + fbm(in.world * 0.16 + vec2f(5.0, 2.0)) * 0.4;
  let ruts = ridge(in.world * vec2f(0.11, 0.045) + vec2f(2.0, 0.0));
  let churn = clamp(0.58 + clods * 0.72 + ruts * 0.28, 0.42, 1.30);
  col = mix(col, col * churn, earth);
  // Field water: where the water weight is present, shade the fragment with the
  // shared water material and blend it over the ground by the weight, so the shore
  // fades cleanly from turf/sand into the sea instead of a hard tint edge. The
  // mesh z is untouched (no displacement) — this is a per-fragment ripple normal +
  // foam only, so soldiers and props still ride the ground.
  if (in.water > 0.001) {
    let water = fieldWaterColor(in.world, in.water);
    col = mix(col, water, clamp(in.water, 0.0, 1.0));
  }
  col = mix(col, BATTLE_HAZE, in.fog);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

export class BattleGroundPass {
  private pipeline: GPURenderPipeline;
  private groundBindGroupLayout: GPUBindGroupLayout;
  private groundBindGroup: GPUBindGroup;
  private uniformBuffer: GPUBuffer;
  private meadowSampler: GPUSampler;
  private meadowTexture: GPUTexture;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private indexCount = 0;
  private triangles = 0;
  private meadowStats = {
    enabled: false,
    source: 'procedural' as 'procedural' | 'field',
    depthNear: 0,
    depthFar: 1,
    nearStrength: 0,
    farStrength: 0,
    textureWidth: 1,
    textureHeight: 1,
    textureCellSize: 1,
    fieldRecords: 0,
    fieldCoverage: 0,
    softCoverage: 0,
    avgDensity: 0,
    avgCoverage: 0,
    directionalCoverage: 0,
    textureBytes: 4,
    fieldFloor: 0,
    coverageSpread: 0,
    rootMassEnabled: false,
    rootMassStrength: 0,
    rootMassCoverage: 0,
    rootMassAvg: 0,
    rootMassSpread: 0,
    bodyDomainEnabled: false,
    bodyDomainId: 'off',
    bodyDomainTextureWidth: 1,
    bodyDomainTextureHeight: 1,
    bodyDomainCellSize: 1,
    bodyDomainCoverageMin: 0,
    bodyDomainCoverageMax: 0,
    bodyDomainCoverageAvg: 0,
    bodyDomainCoverageMedian: 0,
    bodyDomainExposedGround: 1,
    bodyDomainTextureBytes: 4,
    bodyDomainMaterialBytes: 0,
    bodyDomainSubmittedTriangles: 0,
    bodyDomainMaterialOnly: true,
    bodyDomainRepresentation: 'off',
    bodyDomainFiberFrequency: 0,
    bodyDomainSourceAttached: false,
  };

  constructor(private shell: RawFrameShell, private environment: BattleEnvironment = BATTLE_ENVIRONMENTS['golden-hour']) {
    const module = compileShader(shell.device, GROUND_WGSL(environment), `battle-ground-heightfield-${environment.id}`);
    this.groundBindGroupLayout = shell.device.createBindGroupLayout({
      label: 'battle-ground-uniform-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
      ],
    });
    this.pipeline = shell.device.createRenderPipeline({
      label: 'battle-ground-heightfield-pipeline',
      layout: shell.device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout, this.groundBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 40,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32' },
          ],
        }],
      },
      fragment: { module, entryPoint: 'fs', targets: [gpuOpaqueColorTarget(shell.info.format)] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: gpuWorldDepthStencil('read-write'),
      multisample: gpuMultisample(shell.sampleCount),
    });
    this.uniformBuffer = shell.device.createBuffer({
      label: 'battle-ground-uniforms',
      size: 24 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.meadowSampler = shell.device.createSampler({
      label: 'battle-ground-meadow-sampler',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this.meadowTexture = createMeadowTexture(shell.device, 1, 1, new Uint8Array([0, 128, 128, 0]));
    this.groundBindGroup = this.createGroundBindGroup();
    this.setMeadow();
  }

  private createGroundBindGroup(): GPUBindGroup {
    return this.shell.device.createBindGroup({
      label: 'battle-ground-bind-group',
      layout: this.groundBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.meadowSampler },
        { binding: 2, resource: this.meadowTexture.createView() },
      ],
    });
  }

  setMeadow(params: {
    depthNear?: number;
    depthFar?: number;
    nearStrength?: number;
    farStrength?: number;
  } = {}) {
    const depthNear = Number.isFinite(params.depthNear) ? params.depthNear! : 0;
    const depthFar = Number.isFinite(params.depthFar) ? params.depthFar! : 1;
    const nearStrength = Number.isFinite(params.nearStrength) ? params.nearStrength! : 0;
    const farStrength = Number.isFinite(params.farStrength) ? params.farStrength! : 0;
    const enabled = Math.max(0, Math.min(1, Math.max(nearStrength, farStrength)));
    this.meadowStats = {
      enabled: enabled > 0,
      source: 'procedural',
      depthNear,
      depthFar: Math.max(depthNear + 0.001, depthFar),
      nearStrength: Math.max(0, Math.min(1, nearStrength)),
      farStrength: Math.max(0, Math.min(1, farStrength)),
      textureWidth: 1,
      textureHeight: 1,
      textureCellSize: 1,
      fieldRecords: 0,
      fieldCoverage: 0,
      softCoverage: 0,
      avgDensity: 0,
      avgCoverage: 0,
      directionalCoverage: 0,
      textureBytes: 4,
      fieldFloor: 0,
      coverageSpread: 0,
      rootMassEnabled: false,
      rootMassStrength: 0,
      rootMassCoverage: 0,
      rootMassAvg: 0,
      rootMassSpread: 0,
      bodyDomainEnabled: false,
      bodyDomainId: 'off',
      bodyDomainTextureWidth: 1,
      bodyDomainTextureHeight: 1,
      bodyDomainCellSize: 1,
      bodyDomainCoverageMin: 0,
      bodyDomainCoverageMax: 0,
      bodyDomainCoverageAvg: 0,
      bodyDomainCoverageMedian: 0,
      bodyDomainExposedGround: 1,
      bodyDomainTextureBytes: 4,
      bodyDomainMaterialBytes: 0,
      bodyDomainSubmittedTriangles: 0,
      bodyDomainMaterialOnly: true,
      bodyDomainRepresentation: 'off',
      bodyDomainFiberFrequency: 0,
      bodyDomainSourceAttached: false,
    };
    this.writeMeadowUniforms([
      enabled,
      0,
      1,
      0,
      depthNear,
      this.meadowStats.depthFar,
      this.meadowStats.nearStrength,
      this.meadowStats.farStrength,
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      1,
      0,
      0,
      0,
      0,
    ]);
  }

  setMeadowFromGrassField(snapshot: GrassFieldSnapshot, bounds: BattleMeadowBounds, params: BattleMeadowParams = {}) {
    const depthNear = Number.isFinite(params.depthNear) ? params.depthNear! : 0;
    const depthFar = Number.isFinite(params.depthFar) ? params.depthFar! : 1;
    const nearStrength = clamp01(Number.isFinite(params.nearStrength) ? params.nearStrength! : 0.95);
    const farStrength = clamp01(Number.isFinite(params.farStrength) ? params.farStrength! : 0.40);
    const texture = buildMeadowTexture(snapshot, bounds, params);
    const rootMassStrength = Math.max(0, Math.min(2, Number.isFinite(params.rootMassStrength) ? params.rootMassStrength! : 0));
    const rootMassContrast = Math.max(0.25, Number.isFinite(params.rootMassContrast) ? params.rootMassContrast! : 1);
    const bodyDomainStrength = Math.max(0, Math.min(2, Number.isFinite(params.bodyDomainStrength) ? params.bodyDomainStrength! : 0));
    const bodyDomainScale = Math.max(0.01, Number.isFinite(params.bodyDomainScale) ? params.bodyDomainScale! : 0.84);
    const bodyDomainContrast = Math.max(0.35, Math.min(2.5, Number.isFinite(params.bodyDomainContrast) ? params.bodyDomainContrast! : 0.82));
    const requestedBodyDomainId = params.bodyDomainId === 'field-continuous-strand-texture'
      ? 'field-continuous-strand-texture'
      : 'field-strand-material';
    const bodyDomainId = bodyDomainStrength > 0 ? requestedBodyDomainId : 'off';
    const bodyDomainMode = bodyDomainId === 'field-continuous-strand-texture' ? 1 : 0;
    const bodyDomainFiberFrequency = bodyDomainStrength > 0 ? Math.max(0.01, Number.isFinite(params.bodyDomainFiberFrequency) ? params.bodyDomainFiberFrequency! : bodyDomainScale) : 0;
    const bodyDomainTextureBytes = bodyDomainStrength > 0 ? texture.width * texture.height * 4 : 0;
    this.meadowTexture.destroy();
    this.meadowTexture = createMeadowTexture(this.shell.device, texture.width, texture.height, texture.pixels, texture.bytesPerRow);
    this.groundBindGroup = this.createGroundBindGroup();
    const enabled = Math.max(nearStrength, farStrength);
    this.meadowStats = {
      enabled: enabled > 0 && snapshot.records.length > 0,
      source: 'field',
      depthNear,
      depthFar: Math.max(depthNear + 0.001, depthFar),
      nearStrength,
      farStrength,
      textureWidth: texture.width,
      textureHeight: texture.height,
      textureCellSize: texture.cellSize,
      fieldRecords: snapshot.records.length,
      fieldCoverage: texture.coverage,
      softCoverage: texture.softCoverage,
      avgDensity: texture.avgDensity,
      avgCoverage: texture.avgCoverage,
      directionalCoverage: texture.directionalCoverage,
      textureBytes: texture.width * texture.height * 4,
      fieldFloor: clamp01(Number.isFinite(params.fieldFloor) ? params.fieldFloor! : 0),
      coverageSpread: texture.coverageSpread,
      rootMassEnabled: rootMassStrength > 0,
      rootMassStrength,
      rootMassCoverage: texture.rootMassCoverage,
      rootMassAvg: texture.rootMassAvg,
      rootMassSpread: texture.rootMassSpread,
      bodyDomainEnabled: bodyDomainStrength > 0,
      bodyDomainId,
      bodyDomainTextureWidth: texture.width,
      bodyDomainTextureHeight: texture.height,
      bodyDomainCellSize: texture.cellSize,
      bodyDomainCoverageMin: texture.bodyDomainCoverageMin,
      bodyDomainCoverageMax: texture.bodyDomainCoverageMax,
      bodyDomainCoverageAvg: texture.bodyDomainCoverageAvg,
      bodyDomainCoverageMedian: texture.bodyDomainCoverageMedian,
      bodyDomainExposedGround: texture.bodyDomainExposedGround,
      bodyDomainTextureBytes: texture.width * texture.height * 4,
      bodyDomainMaterialBytes: bodyDomainTextureBytes,
      bodyDomainSubmittedTriangles: 0,
      bodyDomainMaterialOnly: true,
      bodyDomainRepresentation: bodyDomainId === 'field-continuous-strand-texture' ? 'continuous-strand-texture' : bodyDomainId === 'field-strand-material' ? 'field-strand-material' : 'off',
      bodyDomainFiberFrequency,
      bodyDomainSourceAttached: false,
    };
    this.writeMeadowUniforms([
      enabled,
      1,
      Number.isFinite(params.densityScale) ? Math.max(0.01, params.densityScale!) : 1,
      Number.isFinite(params.streakStrength) ? Math.max(0, params.streakStrength!) : 1,
      depthNear,
      this.meadowStats.depthFar,
      nearStrength,
      farStrength,
      bounds.x,
      bounds.y,
      Math.max(0.001, bounds.width),
      Math.max(0.001, bounds.height),
      rootMassStrength > 0 ? 1 : 0,
      rootMassStrength,
      rootMassContrast,
      this.meadowStats.fieldFloor,
      bodyDomainStrength > 0 ? 1 : 0,
      bodyDomainStrength,
      bodyDomainScale,
      bodyDomainContrast,
      bodyDomainMode,
      bodyDomainFiberFrequency,
      0,
      0,
    ]);
  }

  /** Build the displaced grid mesh from the grid (tint/dims) and a shared height
   *  field (carrying the render exaggeration, so props and soldiers ride the
   *  exact same surface). `step` cells per quad downsamples the sim grid (600×400)
   *  to a mesh fine enough to read the relief, coarse enough to stay cheap. */
  setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover, step = 2) {
    const mesh = buildBattleGroundMesh(grid, field, cover, step);
    this.upload(mesh.vertices, mesh.indices);
    this.triangles = mesh.triangles;
  }

  private upload(verts: Float32Array, indices: Uint32Array) {
    const device = this.shell.device;
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.vertexBuffer = device.createBuffer({ label: 'battle-ground-vertices', size: verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.vertexBuffer, 0, verts);
    this.indexBuffer = device.createBuffer({ label: 'battle-ground-indices', size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.indexBuffer, 0, indices);
    this.indexCount = indices.length;
  }

  draw(pass: WorldRenderPass) {
    if (!this.vertexBuffer || !this.indexBuffer || this.indexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setBindGroup(1, this.groundBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.indexCount);
  }

  stats() {
    return {
      triangles: this.triangles,
      layer: 'battle-ground-heightfield' as const,
      environment: battleEnvironmentStats(this.environment),
      meadow: this.meadowStats,
    };
  }

  private writeMeadowUniforms(values: number[]): void {
    this.shell.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array(values));
  }
}

/** The battle ground mesh, CPU-built: interleaved stride-10 vertices
 *  (pos3, normal3, color3, waterWeight1) + uint32 triangle indices. Extracted so
 *  the pass and the photoreal battle world (slice 08a) displace/tint the exact
 *  same surface from the exact same data. */
export interface BattleGroundMesh {
  /** Interleaved: x,y,z, nx,ny,nz, r,g,b, water — 10 floats per vertex. */
  vertices: Float32Array;
  indices: Uint32Array;
  triangles: number;
}

export function buildBattleGroundMesh(
  grid: BattleTerrainGrid,
  field: TerrainHeightField,
  cover: BattleGroundCover,
  step = 2,
): BattleGroundMesh {
  const base = GROUND_COVER_COLOR[cover] ?? GROUND_COVER_COLOR['green-grass'];
  const nx = Math.floor(grid.w / step) + 1;
  const ny = Math.floor(grid.h / step) + 1;
  const verts = new Float32Array(nx * ny * 10);
  const cellWorld = (ci: number, cj: number): [number, number] => [
    grid.ox + Math.min(ci, grid.w - 1) * grid.cell + grid.cell * 0.5,
    grid.oy + Math.min(cj, grid.h - 1) * grid.cell + grid.cell * 0.5,
  ];
  // Box-filter the feature tint over the step block so a forest/mud boundary
  // fades across cells instead of stair-stepping per coarse vertex.
  const cellColor = (ci: number, cj: number): [number, number, number] => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -step; dy <= step; dy++) {
      for (let dx = -step; dx <= step; dx++) {
        const sx = ci + dx;
        const sy = cj + dy;
        if (sx < 0 || sy < 0 || sx >= grid.w || sy >= grid.h) continue;
        const overlay = TINT_COLOR[grid.tint[sy * grid.w + sx]];
        const c = overlay ? mix(base, overlay, 0.82) : base;
        r += c[0]; g += c[1]; b += c[2]; n++;
      }
    }
    return n > 0 ? [r / n, g / n, b / n] : base;
  };
  // Water weight, box-filtered exactly like the tint colour so the shore fades
  // across cells instead of stair-stepping: the fraction of the step block that
  // is water tint. This is the field water's distance-from-shore proxy (0 at the
  // edge → 1 deep in the body) that the shared shore ramp keys on.
  const cellWater = (ci: number, cj: number): number => {
    let water = 0, n = 0;
    for (let dy = -step; dy <= step; dy++) {
      for (let dx = -step; dx <= step; dx++) {
        const sx = ci + dx;
        const sy = cj + dy;
        if (sx < 0 || sy < 0 || sx >= grid.w || sy >= grid.h) continue;
        if (grid.tint[sy * grid.w + sx] === WATER_TINT) water++;
        n++;
      }
    }
    return n > 0 ? water / n : 0;
  };
  let v = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ci = Math.min(i * step, grid.w - 1);
      const cj = Math.min(j * step, grid.h - 1);
      const [x, y] = cellWorld(ci, cj);
      const z = terrainHeightAt(field, x, y);
      // Surface normal from the height gradient (central difference in world).
      const d = grid.cell * step;
      const hx = terrainHeightAt(field, x + d, y) - terrainHeightAt(field, x - d, y);
      const hy = terrainHeightAt(field, x, y + d) - terrainHeightAt(field, x, y - d);
      const nlen = Math.hypot(hx, hy, 2 * d) || 1;
      const color = cellColor(ci, cj);
      verts[v++] = x; verts[v++] = y; verts[v++] = z;
      verts[v++] = -hx / nlen; verts[v++] = -hy / nlen; verts[v++] = (2 * d) / nlen;
      verts[v++] = color[0]; verts[v++] = color[1]; verts[v++] = color[2];
      verts[v++] = cellWater(ci, cj);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const dd = c + 1;
      indices.push(a, c, b, b, c, dd);
    }
  }
  return { vertices: verts, indices: new Uint32Array(indices), triangles: indices.length / 3 };
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export interface BattleMeadowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BattleMeadowParams {
  depthNear?: number;
  depthFar?: number;
  nearStrength?: number;
  farStrength?: number;
  cellSize?: number;
  spread?: number;
  densityScale?: number;
  streakStrength?: number;
  fieldFloor?: number;
  coverageSpread?: number;
  rootMassStrength?: number;
  rootMassContrast?: number;
  rootMassSpread?: number;
  bodyDomainStrength?: number;
  bodyDomainScale?: number;
  bodyDomainContrast?: number;
  bodyDomainId?: 'field-strand-material' | 'field-continuous-strand-texture';
  bodyDomainFiberFrequency?: number;
}

function buildMeadowTexture(snapshot: GrassFieldSnapshot, bounds: BattleMeadowBounds, params: BattleMeadowParams) {
  const cellSize = Math.max(2, finiteOr(params.cellSize, 14));
  const width = clampInt(Math.ceil(bounds.width / cellSize), 1, 256);
  const height = clampInt(Math.ceil(bounds.height / cellSize), 1, 256);
  const spread = Math.max(cellSize, finiteOr(params.spread, cellSize * 2.4));
  const coverageSpread = Math.max(cellSize, finiteOr(params.coverageSpread, spread * 1.35));
  const rootMassSpread = Math.max(cellSize * 0.75, finiteOr(params.rootMassSpread, spread * 0.42));
  const density = new Float32Array(width * height);
  const dirX = new Float32Array(width * height);
  const dirY = new Float32Array(width * height);
  const clump = new Float32Array(width * height);
  const rootDensity = new Float32Array(width * height);
  const weight = new Float32Array(width * height);
  const phase = new Float32Array(width * height);
  for (const record of snapshot.records) {
    const px = ((record.x - bounds.x) / Math.max(0.001, bounds.width)) * width;
    const py = ((record.y - bounds.y) / Math.max(0.001, bounds.height)) * height;
    const radiusPx = Math.max(1, Math.ceil(Math.max(spread, rootMassSpread) / cellSize));
    const x0 = Math.max(0, Math.floor(px - radiusPx));
    const x1 = Math.min(width - 1, Math.ceil(px + radiusPx));
    const y0 = Math.max(0, Math.floor(py - radiusPx));
    const y1 = Math.min(height - 1, Math.ceil(py + radiusPx));
    const clumpAngle = hash01((record.clumpSeed | 0) ^ 0x6d2b_79f5) * Math.PI * 2;
    const flowX = Math.cos(clumpAngle) * 0.72 + Math.cos(record.yaw) * 0.28;
    const flowY = Math.sin(clumpAngle) * 0.72 + Math.sin(record.yaw) * 0.28;
    const flowLen = Math.hypot(flowX, flowY) || 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const wx = bounds.x + ((x + 0.5) / width) * bounds.width;
        const wy = bounds.y + ((y + 0.5) / height) * bounds.height;
        const dist = Math.hypot(wx - record.x, wy - record.y);
        const d = dist / spread;
        const rootD = dist / rootMassSpread;
        if (d >= 1 && rootD >= 1) continue;
        const i = y * width + x;
        const slope = smoothstepRange(0.50, 0.80, record.normalZ);
        if (d < 1) {
          const falloff = (1 - d * d) * (1 - d * 0.34);
          const w = falloff * (0.55 + record.clumpWeight * 0.45) * slope;
          density[i] += w;
          dirX[i] += (flowX / flowLen) * w;
          dirY[i] += (flowY / flowLen) * w;
          clump[i] += record.clumpWeight * w;
          phase[i] += hash01((record.bladeSeed | 0) ^ 0x94d0_49bb) * w;
          weight[i] += w;
        }
        if (rootD < 1) {
          const rootFalloff = (1 - rootD * rootD) * (1 - rootD * rootD);
          const rootW = rootFalloff * (0.32 + record.clumpWeight * 0.68) * slope;
          rootDensity[i] += rootW;
        }
      }
    }
  }
  const mass = new Float32Array(width * height);
  const rootMass = new Float32Array(width * height);
  for (let i = 0; i < mass.length; i++) {
    mass[i] = clamp01(1 - Math.exp(-density[i] * 0.035));
    rootMass[i] = clamp01(1 - Math.exp(-rootDensity[i] * 0.065));
  }
  const coverage = softenCoverage(mass, width, height, Math.max(1, Math.ceil(coverageSpread / cellSize)));
  const rootCoverage = softenCoverage(rootMass, width, height, Math.max(1, Math.ceil((rootMassSpread * 0.72) / cellSize)));
  const rowBytes = width * 4;
  const bytesPerRow = alignTo(rowBytes, 256);
  const pixels = new Uint8Array(bytesPerRow * height);
  let covered = 0;
  let softCovered = 0;
  let densitySum = 0;
  let coverageSum = 0;
  let directionSum = 0;
  let rootCovered = 0;
  let rootMassSum = 0;
  let bodyDomainMin = 1;
  let bodyDomainMax = 0;
  let bodyDomainSum = 0;
  let bodyDomainExposed = 0;
  const bodyDomainValues: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const rawMass = mass[i];
      const softMass = coverage[i];
      const rootRaw = rootMass[i];
      const rootSoft = rootCoverage[i];
      const rootValue = smoothstepRange(0.025, 0.70, Math.max(rootRaw * 0.88, rootSoft * 0.72));
      const bodyDomainValue = clamp01(Math.max(softMass, rawMass * 0.82, rootValue * 0.64));
      const w = weight[i];
      const directionLength = w > 0 ? Math.min(1, Math.hypot(dirX[i], dirY[i]) / w) : 0;
      const clumpAvg = w > 0 ? clump[i] / w : 0;
      const phaseAvg = w > 0 ? phase[i] / w : hash01((x * 73856093) ^ (y * 19349663));
      if (rawMass > 0.06) covered++;
      if (softMass > 0.08) softCovered++;
      densitySum += rawMass;
      coverageSum += softMass;
      directionSum += directionLength * rawMass;
      if (rootValue > 0.08) rootCovered++;
      rootMassSum += rootValue;
      bodyDomainMin = Math.min(bodyDomainMin, bodyDomainValue);
      bodyDomainMax = Math.max(bodyDomainMax, bodyDomainValue);
      bodyDomainSum += bodyDomainValue;
      if (bodyDomainValue < 0.18) bodyDomainExposed++;
      bodyDomainValues.push(bodyDomainValue);
      const o = y * bytesPerRow + x * 4;
      pixels[o] = Math.round(rawMass * 255);
      pixels[o + 1] = Math.round(softMass * 255);
      pixels[o + 2] = Math.round(rootValue * 255);
      pixels[o + 3] = Math.round(clamp01(phaseAvg * 0.82 + clumpAvg * 0.18) * 255);
    }
  }
  const texels = width * height;
  bodyDomainValues.sort((a, b) => a - b);
  const medianBodyDomain = bodyDomainValues.length === 0
    ? 0
    : bodyDomainValues[Math.floor((bodyDomainValues.length - 1) / 2)];
  return {
    width,
    height,
    cellSize,
    coverageSpread: round3(coverageSpread),
    pixels,
    bytesPerRow,
    coverage: round3(covered / Math.max(1, texels)),
    softCoverage: round3(softCovered / Math.max(1, texels)),
    avgDensity: round3(densitySum / Math.max(1, texels)),
    avgCoverage: round3(coverageSum / Math.max(1, texels)),
    directionalCoverage: round3(directionSum / Math.max(0.001, densitySum)),
    rootMassCoverage: round3(rootCovered / Math.max(1, texels)),
    rootMassAvg: round3(rootMassSum / Math.max(1, texels)),
    rootMassSpread: round3(rootMassSpread),
    bodyDomainCoverageMin: round3(bodyDomainMin === 1 && texels === 0 ? 0 : bodyDomainMin),
    bodyDomainCoverageMax: round3(bodyDomainMax),
    bodyDomainCoverageAvg: round3(bodyDomainSum / Math.max(1, texels)),
    bodyDomainCoverageMedian: round3(medianBodyDomain),
    bodyDomainExposedGround: round3(bodyDomainExposed / Math.max(1, texels)),
  };
}

function softenCoverage(mass: Float32Array, width: number, height: number, radiusPx: number): Float32Array {
  const out = new Float32Array(width * height);
  const radius = Math.max(1, Math.min(18, radiusPx));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;
      let dilated = mass[y * width + x];
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = x + dx;
          if (sx < 0 || sx >= width) continue;
          const dist = Math.hypot(dx, dy) / radius;
          if (dist > 1) continue;
          const falloff = (1 - dist * dist);
          const weight = falloff * falloff;
          const value = mass[sy * width + sx];
          sum += value * weight;
          weightSum += weight;
          dilated = Math.max(dilated, value * (1 - dist * 0.38));
        }
      }
      const blurred = weightSum > 0 ? sum / weightSum : 0;
      const soft = Math.max(mass[y * width + x], blurred * 1.28, dilated * 0.62);
      out[y * width + x] = smoothstepRange(0.018, 0.54, soft);
    }
  }
  return out;
}

function createMeadowTexture(device: GPUDevice, width: number, height: number, pixels: Uint8Array, bytesPerRow = width * 4): GPUTexture {
  const texture = device.createTexture({
    label: 'battle-ground-meadow-field',
    size: { width, height },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const rowBytes = width * 4;
  const paddedBytesPerRow = alignTo(bytesPerRow, 256);
  const source = bytesPerRow === paddedBytesPerRow && pixels.length >= paddedBytesPerRow * height
    ? pixels
    : padTextureRows(pixels, rowBytes, paddedBytesPerRow, height);
  device.queue.writeTexture(
    { texture },
    source,
    { bytesPerRow: paddedBytesPerRow, rowsPerImage: height },
    { width, height },
  );
  return texture;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstepRange(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash01(seed: number): number {
  let h = seed >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb_352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846c_a68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function alignTo(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function padTextureRows(src: Uint8Array, rowBytes: number, bytesPerRow: number, rows: number): Uint8Array {
  const out = new Uint8Array(bytesPerRow * rows);
  for (let y = 0; y < rows; y++) {
    const srcStart = y * rowBytes;
    out.set(src.subarray(srcStart, srcStart + rowBytes), y * bytesPerRow);
  }
  return out;
}
