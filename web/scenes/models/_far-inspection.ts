import type { BattleCameraSnapshot } from "../../../packages/battle-renderer/src/types";

/** Admission and magnified property inspection are deliberately different views. */
export function farAdmissionCamera(camera: BattleCameraSnapshot): BattleCameraSnapshot {
  return {
    ...camera,
    zoom: 0.9,
    camera3d: { ...camera.camera3d, distance: 2000, fovY: 0.85 },
  };
}
