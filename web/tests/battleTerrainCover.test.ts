// @vitest-environment node
import { expect, test } from "vitest";

test("production CPU vista seams retain mixed forest coverage without phantom rock", async () => {
  const { buildBattleVistaGeometry } =
    await import("@packages/game-renderer/src/battle/vistaGeometry");
  const { buildPhotorealBattleGroundMesh } =
    await import("@packages/game-renderer/src/battle/groundPass");
  const grid = {
    w: 4,
    h: 4,
    cell: 2,
    ox: -4,
    oy: -4,
    height: new Float32Array(16),
    tint: Uint8Array.from({ length: 16 }, (_, i) => (i >= 8 ? 4 : 0)),
    speed: new Float32Array(16),
    rough: new Float32Array(16),
  };
  const ground = buildPhotorealBattleGroundMesh(
    grid,
    { ...grid, units: "meters", verticalScale: 1 },
    "green-grass",
    2,
  );
  const rings = buildBattleVistaGeometry(
    {
      shape: "forest boundary",
      bands: [
        {
          name: "vista",
          w: 5,
          h: 5,
          cell: 4,
          ox: -8,
          oy: -8,
          innerHalfW: 4,
          innerHalfH: 4,
          outerHalfW: 8,
          outerHalfH: 8,
          height: new Float32Array(25),
          shoreDistance: new Float32Array(25).fill(-1000),
        },
      ],
    },
    "green-grass",
    ground,
  );
  const cover = rings[0].mesh.coverage;
  let mixed = 0;
  for (let i = 0; i < cover.length; i += 3) {
    expect(cover[i]).toBe(0);
    expect(cover[i + 2]).toBe(0);
    if (cover[i + 1] > 0 && cover[i + 1] < 1) mixed++;
  }
  expect(mixed).toBeGreaterThan(0);
});
