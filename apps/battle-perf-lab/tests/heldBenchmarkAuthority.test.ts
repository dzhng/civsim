/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
import { fileURLToPath } from "node:url";
import { heldBenchmarkPlugins } from "../src/held/heldBenchmarkPlugin";

const battleLoop = fileURLToPath(new URL("../../../web/src/battle/battleLoop.ts", import.meta.url));
const heldModule = fileURLToPath(new URL("../src/held/HeldBenchmarkAuthority.ts", import.meta.url));

test("an unset held tick leaves the lab build's benchmark live", () => {
  expect(heldBenchmarkPlugins(undefined)).toEqual([]);
});

test("only the canonical contact ticks can be held", () => {
  for (const value of ["", "9001", "15000", "9000.0"])
    expect(() => heldBenchmarkPlugins(value)).toThrow(/9000\|12000/);
});

test("a held build substitutes the authority only where the battle loop reads it", async () => {
  const [plugin] = heldBenchmarkPlugins("12000");
  expect(plugin.config()).toEqual({ define: { __BATTLE_BENCHMARK_HELD_TICK__: "12000" } });
  expect(plugin.resolveId("./benchmark/benchmarkAuthority", `${battleLoop}?t=1`)).toBe(heldModule);
  expect(plugin.resolveId("./benchmark/benchmarkAuthority", heldModule)).toBeNull();
  expect(plugin.resolveId("./benchmarkAuthority", battleLoop)).toBeNull();

  plugin.configResolved({ command: "build" });
  expect(() => plugin.buildEnd()).not.toThrow();

  vi.stubGlobal("__BATTLE_BENCHMARK_HELD_TICK__", 12000);
  try {
    const { BENCHMARK_AUTHORITY } = await import("../src/held/HeldBenchmarkAuthority");
    expect(BENCHMARK_AUTHORITY).toEqual({ kind: "held", tick: 12000 });
  } finally {
    vi.unstubAllGlobals();
  }
});

test("a held build that never reaches the battle loop's import fails instead of shipping live", () => {
  const [build] = heldBenchmarkPlugins("9000");
  build.configResolved({ command: "build" });
  expect(() => build.buildEnd()).toThrow(/never reached/);
  // A failed build keeps its own error, and a dev server may not have loaded a battle yet.
  expect(() => build.buildEnd(new Error("syntax"))).not.toThrow();
  const [serve] = heldBenchmarkPlugins("9000");
  serve.configResolved({ command: "serve" });
  expect(() => serve.buildEnd()).not.toThrow();
});
