import { expect, it } from "vitest";
import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { benchmarkOpeningOrders } from "./benchmarkScenario";

it("orders each player unit to the nearest enemy with stable ties, independent of later WASM mutations", () => {
  const stride = 35;
  const info = new Float32Array(stride * 5);
  [
    [0, 0, 0],
    [1, 4, 0],
    [0, 10, 0],
    [1, -4, 0],
    [1, 11, 0],
  ].forEach(([team, x, y], unit) => {
    info[unit * stride + UNIT_INFO.team] = team;
    info[unit * stride + UNIT_INFO.centerX] = x;
    info[unit * stride + UNIT_INFO.centerY] = y;
  });
  const orders = benchmarkOpeningOrders(info, stride);
  info.fill(0);
  expect(orders).toEqual([
    { unit: 0, target: 1 },
    { unit: 2, target: 4 },
  ]);
});
