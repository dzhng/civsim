import * as THREE from "three/webgpu";
import {
  corpsePresentationStrength,
  type CrowdInstance,
} from "../../../crowd-runtime/src/instanceData";
import {
  assignLodForContributions,
  countLods,
  DEFAULT_LOD_POLICY,
  instanceScreenSize,
  type LodLevel,
} from "../../../crowd-runtime/src/lod";
import { projectionDepth, type ProjectionFootprint } from "../../../renderer-core/src/camera3d";
import type { AppearanceBundle } from "../../../soldier-assets/src/appearanceBundle";

export interface CrowdProjectionView {
  frustum: THREE.Frustum;
  projection: ProjectionFootprint;
  shadow: boolean;
}

/** Bounds select contributing views; only those actual projections demand detail. */
export function planPhotorealCrowdLods(
  instances: CrowdInstance[],
  views: readonly CrowdProjectionView[],
  assets: Record<number, { manifest: Pick<AppearanceBundle["manifest"], "bounds"> }>,
  prevLevels?: ArrayLike<number>,
  policy = DEFAULT_LOD_POLICY,
) {
  const sphere = new THREE.Sphere();
  const visibility = new Uint8Array(instances.length);
  let viewVisible = 0,
    shadowOnly = 0;
  const assignments = instances.map((inst, index) => {
    const { center, radius } = assets[inst.classId].manifest.bounds;
    const angle = inst.facing - Math.PI / 2;
    const variant = inst.deathVariant ?? 0;
    const roll =
      corpsePresentationStrength(inst) * ((variant - 1) * 0.42 + Math.sin(variant * 2.3) * 0.18);
    const y = center[1] * Math.cos(roll) - center[2] * Math.sin(roll);
    const z = center[1] * Math.sin(roll) + center[2] * Math.cos(roll);
    sphere.center.set(
      inst.x + center[0] * Math.cos(angle) - y * Math.sin(angle),
      inst.y + center[0] * Math.sin(angle) + y * Math.cos(angle),
      (inst.elevation ?? 0) + z,
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
    return assignLodForContributions(
      viewPixels,
      shadowPixels,
      prevLevels?.[index] as LodLevel | undefined,
      policy,
    );
  });
  return { assignments, counts: countLods(assignments), visibility, viewVisible, shadowOnly };
}
