import type { CrowdInstance } from "../../../packages/crowd-runtime/src/instanceData";
import { corpsePresentationStrength } from "../../../packages/crowd-runtime/src/instanceData";
import {
  hemiOctTileDirections,
  nearestHemiOctTile,
} from "../../../packages/photoreal-renderer/src/battle/impostorTile";

export interface ImpostorAtlasData {
  columns: number;
  rows: number;
  tileSize: number;
  center: readonly [number, number, number];
  worldSpan: number;
  /** Complete, tightly packed RGBA8 mip chains, including level zero. Albedo is sRGB. */
  albedo: readonly Uint8Array[];
  normal: readonly Uint8Array[];
  orm: readonly Uint8Array[];
}
export interface ImpostorView {
  right: readonly [number, number, number];
  up: readonly [number, number, number];
  eye: readonly [number, number, number];
  fovY: number;
}
/** Mirrors the authored billboard policy. Visibility and LOD selection belong to the caller. */
export function packImpostors(
  atlas: ImpostorAtlasData,
  instances: readonly CrowdInstance[],
  view: ImpostorView,
): Float32Array<ArrayBuffer> {
  const result = new Float32Array(instances.length * 12);
  const dirs = hemiOctTileDirections(atlas.columns, atlas.rows);
  const tanHalf = view.fovY > 0 ? Math.tan(view.fovY / 2) : 0;
  instances.forEach((src, i) => {
    const angle = src.facing - Math.PI / 2,
      c = Math.cos(angle),
      s = Math.sin(angle);
    let dx = view.eye[0] - src.x,
      dy = view.eye[1] - src.y,
      dz = view.eye[2] - (src.elevation ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const divisor = dist || 1;
    dx /= divisor;
    dy /= divisor;
    dz /= divisor;
    const localX = dx * c + dy * s,
      localY = -dx * s + dy * c;
    const length = Math.sqrt(localX * localX + localY * localY + dz * dz) || 1;
    const tile = nearestHemiOctTile(
      localX / length,
      localY / length,
      dz / length,
      atlas.columns,
      atlas.rows,
      dirs,
    );
    let span = atlas.worldSpan;
    if (tanHalf > 0 && dist > 0) {
      const screenFraction = atlas.worldSpan / (2 * dist * tanHalf);
      if (screenFraction < 0.008) span *= 0.008 / screenFraction;
    }
    result.set(
      [
        src.x + atlas.center[0] * c - atlas.center[1] * s,
        src.y + atlas.center[0] * s + atlas.center[1] * c,
        (src.elevation ?? 0) + atlas.center[2],
        src.faction,
        tile,
        span,
        span,
        angle,
        1 - corpsePresentationStrength(src),
        0,
        0,
        0,
      ],
      i * 12,
    );
  });
  return result;
}
