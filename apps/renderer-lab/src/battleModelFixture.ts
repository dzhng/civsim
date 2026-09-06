import { generatedFormation, type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import type { BattleCameraSnapshot } from "@packages/photoreal-renderer/src/battle/battleWorld";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";

export interface BattleModelPose {
  classId: number;
  clip: string;
  phase: number;
  formation: boolean;
  yaw: number;
  pitch: number;
  zoom: number;
  target: [number, number, number];
}

export const DEFAULT_MODEL_POSE: BattleModelPose = {
  classId: 0,
  clip: "idle",
  phase: 0,
  formation: false,
  yaw: 0.45,
  pitch: 1.15,
  zoom: 190,
  target: [0, 0, 1.05],
};

export function modelInstances(
  pose: BattleModelPose,
  assets: Record<number, AppearanceBundle>,
): CrowdInstance[] {
  const bundle = assets[pose.classId];
  if (!bundle) throw new Error(`Unknown appearance: ${pose.classId}`);
  if (!bundle.animation.clips.some((clip) => clip.name === pose.clip))
    throw new Error(`Unknown clip for appearance ${pose.classId}: ${pose.clip}`);
  return generatedFormation(pose.formation ? 16 : 1, {
    columns: pose.formation ? 4 : 1,
    spacing: bundle.manifest.mounted ? 3 : 1.6,
    classId: pose.classId,
    mounted: bundle.manifest.mounted,
  }).map((instance) => ({
    ...instance,
    clip: pose.clip,
    phase: pose.phase,
    alive: pose.clip !== "death_a",
    elevation: 0,
  }));
}

export function modelCamera(
  pose: BattleModelPose,
  width: number,
  height: number,
): BattleCameraSnapshot {
  const camera3d = chartCamera3d(
    { x: pose.target[0], y: pose.target[1], zoom: pose.zoom, yaw: pose.yaw, pitch: pose.pitch },
    height,
  );
  camera3d.aspect = width / height;
  camera3d.target = [...pose.target];
  camera3d.far = 4000;
  return { x: pose.target[0], y: pose.target[1], zoom: pose.zoom, zoomT: 1, camera3d };
}
