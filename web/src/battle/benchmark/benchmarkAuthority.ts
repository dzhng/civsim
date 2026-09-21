/** Whether the simulation keeps running once benchmark timing starts. The Menu
 * benchmark is always live. A lab build may substitute this module to hold the
 * authority at a declared tick, which turns the run into a renderer-only
 * comparison that no live acceptance may count. */
export type BenchmarkAuthority = { kind: "live" } | { kind: "held"; tick: number };

export const BENCHMARK_AUTHORITY: BenchmarkAuthority = { kind: "live" };
