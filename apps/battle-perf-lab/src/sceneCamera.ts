import { frameCamera, type FrameCameraSnapshot } from "./frameCamera";
import type { ImpostorView } from "./impostorData";
import { invert } from "../../../packages/renderer-core/src/mat4";
import { projMatrix, projectionFootprint } from "../../../packages/renderer-core/src/camera3d";
import { PHOTOREAL_FAR_FALLBACK } from "../../../packages/photoreal-renderer/src/cameraBridge";
import type { BattleCameraSnapshot } from "../../../packages/battle-renderer/src/types";
import type { CivsimEnvironment } from "../../../packages/game-renderer/src/environment/environment";

/** Publish one physical projection to scene, visibility, readouts and impostor billboards.
 * Source focus XY is an aerial observer on z=0, independent of elevated look target. */
export function battleSceneCamera(
  input: BattleCameraSnapshot,
  width: number,
  height: number,
  time: number,
  environment: CivsimEnvironment,
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw Error("Battle scene requires positive physical framebuffer dimensions");
  const camera3d = {
    ...input.camera3d,
    aspect: width / height,
    far: input.camera3d.far ?? PHOTOREAL_FAR_FALLBACK,
  };
  const snapshot: FrameCameraSnapshot = {
    ...input,
    camera3d,
    width,
    height,
    time,
    sunAzimuth: environment.sunAzimuth,
    sunElevation: environment.sunElevation,
  };
  const packed = frameCamera(snapshot, width, height);
  const world = invert(packed.view);
  if (!world) throw Error("Battle scene camera is singular");
  const axis = (offset: number): [number, number, number] => {
    const length = Math.hypot(world[offset], world[offset + 1], world[offset + 2]);
    if (!length) throw Error("Battle scene camera has a degenerate basis");
    return [world[offset] / length, world[offset + 1] / length, world[offset + 2] / length];
  };
  const impostor: ImpostorView = {
    right: axis(0),
    up: axis(4),
    eye: [world[12], world[13], world[14]],
    fovY: camera3d.fovY,
  };
  const projection = projMatrix(camera3d);
  return {
    snapshot,
    ...packed,
    world,
    impostor,
    observer: [input.x, input.y, 0] as const,
    viewProjection: packed.bytes.subarray(0, 16),
    projection: projectionFootprint(packed.view, projection, height, camera3d.near),
  };
}
