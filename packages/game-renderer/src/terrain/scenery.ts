import type { SceneryPropId } from "../models/shared/sceneryPropRegistry";

/** Pose and scale use the consuming world's native units. */
export interface SceneryInstance {
  x: number;
  y: number;
  z?: number;
  /** Clearance above the presented ground when this instance is reseated. */
  surfaceOffset?: number;
  size: number;
  height?: number;
  kind: SceneryPropId;
  shade?: number;
  /** per-instance yaw (radians) so cloned meshes don't all face the same way */
  yaw?: number;
}
