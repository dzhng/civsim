import * as THREE from "three/webgpu";
import type { CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import {
  levelForProjection,
  DEFAULT_LOD_POLICY,
  instanceScreenSize,
  type LodLevel,
  type LodCounts,
} from "../../../crowd-runtime/src/lod";
import { projectionDepth, type ProjectionFootprint } from "../../../renderer-core/src/camera3d";
import type { AppearanceBundle } from "../../../soldier-assets/src/appearanceBundle";

export interface CrowdProjectionView {
  frustum: THREE.Frustum;
  projection: ProjectionFootprint;
  shadow: boolean;
}

/** Capacity may exceed the current crowd; only the input-length prefix is valid. */
export interface CrowdLodBuffers {
  levels: Uint8Array;
  shadowLevels: Uint8Array;
  screenSizes: Float64Array;
  shadowScreenSizes: Float64Array;
  visibility: Uint8Array;
}

export function createCrowdLodBuffers(capacity: number): CrowdLodBuffers {
  return {
    levels: new Uint8Array(capacity),
    shadowLevels: new Uint8Array(capacity),
    screenSizes: new Float64Array(capacity),
    shadowScreenSizes: new Float64Array(capacity),
    visibility: new Uint8Array(capacity),
  };
}

/** Bounds select contributing views; only those actual projections demand detail. */
export function planPhotorealCrowdLods(
  instances: readonly CrowdInstance[],
  views: readonly CrowdProjectionView[],
  assets: Record<number, { manifest: Pick<AppearanceBundle["manifest"], "bounds"> }>,
  prevLevels?: ArrayLike<number>,
  policy = DEFAULT_LOD_POLICY,
  prevShadowLevels?: ArrayLike<number>,
  out?: CrowdLodBuffers,
) {
  const sphere = new THREE.Sphere();
  const buffers =
    out && out.levels.length >= instances.length ? out : createCrowdLodBuffers(instances.length);
  const { levels, shadowLevels, screenSizes, shadowScreenSizes, visibility } = buffers;
  visibility.fill(0, 0, instances.length);
  const shadowCounts: LodCounts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  const counts: LodCounts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  let viewVisible = 0,
    shadowOnly = 0;
  for (let index = 0; index < instances.length; index++) {
    const inst = instances[index];
    const { center, radius } = assets[inst.classId].manifest.bounds;
    const angle = inst.facing - Math.PI / 2;
    const cosAngle = Math.cos(angle),
      sinAngle = Math.sin(angle);
    sphere.center.set(
      inst.x + center[0] * cosAngle - center[1] * sinAngle,
      inst.y + center[0] * sinAngle + center[1] * cosAngle,
      (inst.elevation ?? 0) + center[2],
    );
    sphere.radius = radius;
    let viewPixels = 0,
      shadowPixels = 0;
    for (const view of views) {
      if (!view.frustum.intersectsSphere(sphere)) continue;
      visibility[index] |= view.shadow ? 2 : 1;
      const depth = projectionDepth(
        view.projection,
        sphere.center.x,
        sphere.center.y,
        sphere.center.z,
      );
      const pixels =
        depth - radius <= view.projection.near
          ? Infinity
          : instanceScreenSize(inst, view.projection);
      if (view.shadow) shadowPixels = Math.max(policy.minScreenPixels, shadowPixels, pixels);
      else viewPixels = Math.max(viewPixels, pixels);
    }
    if (visibility[index] & 1) viewVisible++;
    else if (visibility[index] & 2) shadowOnly++;
    const shadowLevel = levelForProjection(
      shadowPixels,
      true,
      prevShadowLevels?.[index] as LodLevel | undefined,
      policy,
    );
    shadowLevels[index] = shadowLevel;
    shadowScreenSizes[index] = Math.max(policy.minScreenPixels, shadowPixels);
    if (visibility[index] & 2) shadowCounts[`l${shadowLevel}` as keyof LodCounts]++;
    const level = levelForProjection(
      viewPixels,
      false,
      prevLevels?.[index] as LodLevel | undefined,
      policy,
    );
    levels[index] = level;
    screenSizes[index] = Math.max(policy.minScreenPixels, viewPixels);
    counts[`l${level}` as keyof LodCounts]++;
  }
  return {
    ...buffers,
    counts,
    shadowCounts,
    visibility,
    viewVisible,
    shadowOnly,
  };
}
