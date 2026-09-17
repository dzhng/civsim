import type { BenchmarkAuthority } from "../../../../web/src/battle/benchmark/benchmarkAuthority";

declare const __BATTLE_BENCHMARK_HELD_TICK__: number;

export const BENCHMARK_AUTHORITY: BenchmarkAuthority = {
  kind: "held",
  tick: __BATTLE_BENCHMARK_HELD_TICK__,
};
