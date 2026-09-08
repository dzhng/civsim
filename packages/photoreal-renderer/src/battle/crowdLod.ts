import * as THREE from "three/webgpu";
import type { CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import {
  assignLodForProjection,
  DEFAULT_LOD_POLICY,
  instanceScreenSize,
  type LodLevel,
  type LodAssignment,
  type LodCounts,
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
  prevShadowLevels?: ArrayLike<number>,
) {
  const sphere = new THREE.Sphere();
  const visibility = new Uint8Array(instances.length);
  const shadowAssignments: LodAssignment[] = [];
  const shadowCounts: LodCounts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  const counts: LodCounts = { l0: 0, l1: 0, l2: 0, l3: 0 };
  let viewVisible = 0,
    shadowOnly = 0;
  const assignments = instances.map((inst, index) => {
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
    const shadowAssignment = assignLodForProjection(
      shadowPixels,
      true,
      prevShadowLevels?.[index] as LodLevel | undefined,
      policy,
    );
    shadowAssignments.push(shadowAssignment);
    if (visibility[index] & 2) shadowCounts[`l${shadowAssignment.level}` as keyof LodCounts]++;
    const assignment = assignLodForProjection(
      viewPixels,
      false,
      prevLevels?.[index] as LodLevel | undefined,
      policy,
    );
    counts[`l${assignment.level}` as keyof LodCounts]++;
    return assignment;
  });
  return {
    assignments,
    counts,
    shadowAssignments,
    shadowCounts,
    visibility,
    viewVisible,
    shadowOnly,
  };
}
