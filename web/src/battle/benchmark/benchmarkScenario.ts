import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";

export interface BattleBenchmarkScenario {
  id: string;
  version: number;
  simSeed: number;
  mapSeed: string;
  armySource: "generated-default";
  orders: "player-nearest-enemy-at-tick-zero";
  startTick: number;
  durationMs: number;
  cameraScript: string;
  provisional: boolean;
}

export const BATTLE_BENCHMARK_SCENARIO: BattleBenchmarkScenario = {
  id: "generated-seven-heavy-combat",
  version: 1,
  simSeed: 0x5eedc0de,
  mapSeed: "7",
  armySource: "generated-default",
  orders: "player-nearest-enemy-at-tick-zero",
  startTick: 9000,
  durationMs: 300_000,
  cameraScript: "pending-tactical-tour",
  provisional: true,
};

/** Copy before issuing orders: each WASM mutation can grow or replace the view. */
export function benchmarkOpeningOrders(info: Float32Array, stride: number) {
  const units = Array.from({ length: info.length / stride }, (_, unit) => ({
    unit,
    team: info[unit * stride + UNIT_INFO.team],
    x: info[unit * stride + UNIT_INFO.centerX],
    y: info[unit * stride + UNIT_INFO.centerY],
  }));
  const enemies = units.filter((unit) => unit.team === 1);
  return units
    .filter((unit) => unit.team === 0)
    .flatMap((unit) => {
      let target: number | undefined;
      let nearest = Infinity;
      for (const enemy of enemies) {
        const distance = (unit.x - enemy.x) ** 2 + (unit.y - enemy.y) ** 2;
        if (distance < nearest) {
          nearest = distance;
          target = enemy.unit;
        }
      }
      return target === undefined ? [] : [{ unit: unit.unit, target }];
    });
}
