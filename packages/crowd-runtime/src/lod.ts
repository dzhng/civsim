import type { CrowdInstance } from "./instanceData";
import { projectedSpanPixels, type ProjectionFootprint } from "../../renderer-core/src/camera3d";
import { APPEARANCE_MESH_TIERS, type MeshTiers } from "../../soldier-assets/src/appearanceBundle";

/** 0 through the tier count: levels below `IMPOSTOR_LEVEL` index an appearance's mesh tiers. */
export type LodLevel = Partial<MeshTiers<unknown>>["length"];
export const IMPOSTOR_LEVEL: LodLevel = APPEARANCE_MESH_TIERS.length;
/** All mesh tiers cast; impostors do not. Planner and draw producers share this boundary. */
export const COARSEST_SHADOW_LOD = (IMPOSTOR_LEVEL - 1) as LodLevel;

export interface LodPolicy {
  /** Least projected pixels drawing each mesh tier; smaller bodies draw the impostor. */
  meshPixels: MeshTiers<number>;
  minScreenPixels: number;
}

export interface LodAssignment {
  level: LodLevel;
  screenSize: number;
}

export type LodCounts = Record<`l${LodLevel}`, number>;

/** Count keys by level, so per-instance tallies avoid building strings. */
export const LOD_COUNT_KEYS = Array.from(
  { length: IMPOSTOR_LEVEL + 1 },
  (_, level) => `l${level}` as keyof LodCounts,
);

export function emptyLodCounts(): LodCounts {
  return Object.fromEntries(LOD_COUNT_KEYS.map((key) => [key, 0])) as LodCounts;
}

export const DEFAULT_LOD_POLICY: LodPolicy = {
  meshPixels: [32, 18, 9, 4],
  minScreenPixels: 2.25,
};

export function assignLodForScreenSize(screenSize: number, policy = DEFAULT_LOD_POLICY): LodLevel {
  const size = Math.max(screenSize, policy.minScreenPixels);
  for (let level = 0; level < IMPOSTOR_LEVEL; level++)
    if (size >= policy.meshPixels[level]) return level as LodLevel;
  return IMPOSTOR_LEVEL;
}

export function instanceScreenSize(
  instance: CrowdInstance,
  projection: ProjectionFootprint,
): number {
  const span = 1.8 * (instance.mounted ? 1.45 : 1);
  return projectedSpanPixels(
    projection,
    instance.x,
    instance.y,
    (instance.elevation ?? 0) + span / 2,
    span,
  );
}

// A level change only sticks once the size is past the boundary by `margin`, so
// instances hovering on a threshold don't flip tier every frame.
export function lodWithHysteresis(
  prevLevel: LodLevel,
  screenSize: number,
  policy = DEFAULT_LOD_POLICY,
  margin = 1.5,
): LodLevel {
  const raw = assignLodForScreenSize(screenSize, policy);
  if (raw === prevLevel) return prevLevel;
  // Walk one boundary at a time toward the raw level, committing each edge the
  // size has genuinely cleared and stopping at the first still inside its
  // deadband. Testing only the destination's own edge let a large jump stall on
  // a tier the body had left several boundaries behind.
  let level: number = prevLevel;
  if (raw < prevLevel)
    while (level > raw && screenSize >= policy.meshPixels[level - 1] + margin) level--;
  else while (level < raw && screenSize <= policy.meshPixels[level] - margin) level++;
  return level as LodLevel;
}

/** Each audience uses the same thresholds, but only shadow demand has a mesh floor. */
export function assignLodForProjection(
  pixels: number,
  shadow: boolean,
  prevLevel?: LodLevel,
  policy = DEFAULT_LOD_POLICY,
): LodAssignment {
  const screenSize = Math.max(policy.minScreenPixels, pixels);
  return { level: levelForProjection(pixels, shadow, prevLevel, policy), screenSize };
}

export function levelForProjection(
  pixels: number,
  shadow: boolean,
  prevLevel?: LodLevel,
  policy = DEFAULT_LOD_POLICY,
): LodLevel {
  const screenSize = Math.max(policy.minScreenPixels, pixels);
  let level =
    prevLevel === undefined
      ? assignLodForScreenSize(screenSize, policy)
      : lodWithHysteresis(prevLevel, screenSize, policy);
  if (shadow && pixels > 0) level = Math.min(COARSEST_SHADOW_LOD, level) as LodLevel;
  return level;
}

/** Caller-owned levels, using the same projected footprint as both render audiences. */
export function assignCrowdLodLevels(
  instances: readonly CrowdInstance[],
  projection: ProjectionFootprint,
  prevLevels: ArrayLike<number> | undefined,
  out: Uint8Array,
  policy = DEFAULT_LOD_POLICY,
): void {
  for (let i = 0; i < instances.length; i++)
    out[i] = levelForProjection(
      instanceScreenSize(instances[i], projection),
      false,
      prevLevels?.[i] as LodLevel | undefined,
      policy,
    );
}

export function assignCrowdLods(
  instances: CrowdInstance[],
  projection: ProjectionFootprint,
  policy = DEFAULT_LOD_POLICY,
  prevLevels?: ArrayLike<number>,
): LodAssignment[] {
  return instances.map((inst, i) => {
    return assignLodForProjection(
      instanceScreenSize(inst, projection),
      false,
      prevLevels?.[i] as LodLevel | undefined,
      policy,
    );
  });
}

export function countLods(levels: ArrayLike<number>, count = levels.length): LodCounts {
  const counts = emptyLodCounts();
  for (let i = 0; i < count; i++) counts[LOD_COUNT_KEYS[levels[i]]]++;
  return counts;
}
