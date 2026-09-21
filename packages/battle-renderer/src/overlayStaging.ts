import {
  prepareBattleLineVertices,
  writeBattleLineVertices,
  writeBattleTriangleVertices,
  writeBattleRingInstances,
  type BattleLinePlacement,
} from "../../game-renderer/src/battle/overlayData";
export type OverlayKind = "line" | "triangle" | "ring";
export const overlayAttributeSizes = (kind: OverlayKind): readonly number[] =>
  kind === "line" ? [3, 3, 1] : kind === "triangle" ? [3, 4] : [4, 4];
export const OVERLAY_QUAD = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);
export const OVERLAY_INDICES = new Uint16Array([0, 1, 2, 2, 1, 3]);
export interface OverlayUpload {
  values: Float32Array<ArrayBuffer>[];
  count: number;
}
/** Retain source-equivalent CPU capacity, but expose only active attribute views. */
function staging(sizes: readonly number[], floor: number) {
  let capacity = 0,
    arrays: Float32Array<ArrayBuffer>[] = [];
  return (count: number) => {
    if (count > capacity) {
      capacity = Math.max(count, capacity * 2, floor);
      arrays = sizes.map((s) => new Float32Array(capacity * s));
    }
    return {
      arrays,
      active: () => ({ values: arrays.map((a, i) => a.subarray(0, count * sizes[i])), count }),
    };
  };
}
export function lineStaging(placement: BattleLinePlacement) {
  const stage = staging(overlayAttributeSizes("line"), 128);
  return (vertices: Float32Array): OverlayUpload => {
    const { source, stride, zOff } = prepareBattleLineVertices(vertices, placement),
      count = Math.floor(source.length / stride);
    if (!count) return { values: [], count: 0 };
    const s = stage(count);
    writeBattleLineVertices(source, stride, zOff, placement, s.arrays[0], s.arrays[1], s.arrays[2]);
    return s.active();
  };
}
export function triangleStaging() {
  const stage = staging(overlayAttributeSizes("triangle"), 192);
  return (vertices: Float32Array): OverlayUpload => {
    const count = Math.floor(vertices.length / 6);
    if (!count) return { values: [], count: 0 };
    const s = stage(count);
    writeBattleTriangleVertices(vertices, s.arrays[0], s.arrays[1]);
    return s.active();
  };
}
export function ringStaging(heightAt: (x: number, y: number) => number, lift: number) {
  const stage = staging(overlayAttributeSizes("ring"), 256);
  return (rings: Float32Array): OverlayUpload => {
    const count = Math.floor(rings.length / 7);
    if (!count) return { values: [], count: 0 };
    const s = stage(count);
    writeBattleRingInstances(rings, heightAt, lift, s.arrays[0], s.arrays[1]);
    return s.active();
  };
}
