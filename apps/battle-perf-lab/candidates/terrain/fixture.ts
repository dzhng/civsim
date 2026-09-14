import { createBattleGroundEdgeFixture } from "../../../renderer-lab/src/battleGroundEdgeFixture";
import { buildPhotorealBattleGroundMesh } from "../../../../packages/game-renderer/src/battle/groundPass";
import { buildBattleHorizonLayout } from "../../../../packages/game-renderer/src/battle/horizonPass";
import type { TerrainHeightField } from "../../../../packages/game-renderer/src/terrain/heightField";
import type { BattleSlopeBands } from "../../../../packages/game-renderer/src/battle/terrainFeatures";
import type { Camera3DParams } from "../../../../packages/renderer-core/src/camera3d";
export const WIDTH = 257,
  HEIGHT = 193;
export const slopeBands: BattleSlopeBands = {
  flatMax: 0.1,
  rollingMax: 0.3,
  slowMin: 0.6,
  cliffMin: 1.2,
  cliffDilateCells: 1,
  highlandCapMinM: 80,
};
export const poses: { name: string; camera: Camera3DParams; time: number; strength: number }[] = [
  {
    name: "tactical",
    camera: {
      target: [0, 0, 0],
      distance: 480,
      pitch: 1.2,
      yaw: -1.57,
      fovY: 0.9,
      aspect: WIDTH / HEIGHT,
      near: 0.2,
      far: 12000,
    },
    time: 0,
    strength: 1,
  },
  {
    name: "seam-close",
    camera: {
      target: [-65, 0, 0],
      distance: 95,
      pitch: 1.1,
      yaw: -1.57,
      fovY: 0.9,
      aspect: WIDTH / HEIGHT,
      near: 0.2,
      far: 12000,
    },
    time: 7,
    strength: 0.35,
  },
  {
    name: "horizon",
    camera: {
      target: [0, 0, 0],
      distance: 550,
      pitch: 0.2,
      yaw: -0.8,
      fovY: 0.9,
      aspect: WIDTH / HEIGHT,
      near: 0.2,
      far: 12000,
    },
    time: 20,
    strength: 1,
  },
];
export const VISUAL_WIDTH = 1025,
  VISUAL_HEIGHT = 769;
export const visualPose: (typeof poses)[number] = {
  name: "horizon-readable",
  camera: {
    target: [-30, 60, 0],
    distance: 480,
    pitch: 0.4,
    yaw: -Math.PI / 2,
    fovY: 0.9,
    aspect: VISUAL_WIDTH / VISUAL_HEIGHT,
    near: 0.2,
    far: 12000,
  },
  time: 20,
  strength: 1,
};
export function terrainFixture() {
  const fixture = createBattleGroundEdgeFixture(),
    grid = fixture.grid;
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      const wx = grid.ox + x * grid.cell,
        wy = grid.oy + y * grid.cell;
      grid.height![y * grid.w + x] =
        12 * Math.sin(wx / 70) * Math.sin(wy / 42) +
        (wx > 120 ? 40 * Math.sin((wx - 120) / 28) : 0);
      if (wx > 35 && wx < 100 && wy > 60 && wy < 140) grid.tint[y * grid.w + x] = 1;
      if (wx > 150 && wy > 50) grid.tint[y * grid.w + x] = 2;
    }
  const field: TerrainHeightField = {
    w: grid.w,
    h: grid.h,
    cell: grid.cell,
    ox: grid.ox,
    oy: grid.oy,
    height: grid.height!,
    units: "meters",
    verticalScale: 1,
  };
  const ground = buildPhotorealBattleGroundMesh(grid, field, "green-grass");
  const horizon = buildBattleHorizonLayout(
    grid,
    { west: "cliff", east: "wall", north: "open-fog", south: "open-fog" },
    field,
  );
  return { ground, horizon };
}
