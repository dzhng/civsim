import {
  buildOceanPlaneGeometry,
  buildLakePlaneGeometry,
  type BattleLakeSurfaceSpec,
} from "../../../packages/game-renderer/src/water/battleWaterGeometry";
import { LAKE_SURFACE_LIFT_M } from "../../../packages/game-renderer/src/water/photorealWaterPolicy";
import type { BattleOceanPlaneSpec } from "../../../packages/game-renderer/src/battle/horizonPass";
import type { BattleTerrainGrid } from "../../../packages/game-renderer/src/battle/terrainFeatures";
export type BattleWaterInput =
  | { kind: "ocean"; spec: BattleOceanPlaneSpec }
  | { kind: "lake"; spec: BattleLakeSurfaceSpec; grid: BattleTerrainGrid };
/** Source topology and state packing; GPU resources belong to each backend. */
export function* prepareWaterSurfaces(inputs: readonly BattleWaterInput[]) {
  for (const input of inputs) {
    const geometry: {
      positions: Float32Array<ArrayBuffer>;
      indices: Uint32Array<ArrayBuffer>;
      shoreDist?: Float32Array<ArrayBuffer>;
    } | null =
      input.kind === "lake"
        ? buildLakePlaneGeometry(input.spec, input.grid)
        : buildOceanPlaneGeometry(input.spec);
    if (!geometry) continue;
    yield {
      kind: input.kind,
      ...geometry,
      shoreDist: geometry.shoreDist ?? new Float32Array(geometry.positions.length / 3),
      state: new Float32Array(
        input.kind === "lake"
          ? [input.spec.level + LAKE_SURFACE_LIFT_M, 0, 0, 0]
          : [input.spec.baseZ, input.spec.shoreX, 0, 0],
      ),
    };
  }
}
