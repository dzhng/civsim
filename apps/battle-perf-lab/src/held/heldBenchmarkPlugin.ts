import { fileURLToPath } from "node:url";

const battleLoop = fileURLToPath(
  new URL("../../../../web/src/battle/battleLoop.ts", import.meta.url),
);
const heldAuthority = fileURLToPath(new URL("./HeldBenchmarkAuthority.ts", import.meta.url));

/** Lab builds only: `BATTLE_BENCHMARK_HELD_TICK=9000|12000` holds the Menu benchmark's
 * authority at that canonical tick for a renderer-only comparison. Unset leaves the
 * live benchmark untouched. */
export function heldBenchmarkPlugins(heldTick = process.env.BATTLE_BENCHMARK_HELD_TICK) {
  if (heldTick === undefined) return [];
  if (heldTick !== "9000" && heldTick !== "12000")
    throw Error("Set BATTLE_BENCHMARK_HELD_TICK=9000|12000, or leave it unset for live");
  let command = "serve";
  let substituted = false;
  return [
    {
      name: "held-benchmark-authority",
      enforce: "pre" as const,
      config: () => ({ define: { __BATTLE_BENCHMARK_HELD_TICK__: heldTick } }),
      configResolved: (config: { command: string }) => {
        command = config.command;
      },
      resolveId(source: string, importer?: string) {
        if (source !== "./benchmark/benchmarkAuthority" || importer?.split("?")[0] !== battleLoop)
          return null;
        substituted = true;
        return heldAuthority;
      },
      // A moved import would otherwise ship a live benchmark under a held build's name.
      buildEnd(error?: Error) {
        if (command === "build" && !error && !substituted)
          throw Error("Held benchmark build never reached the battle loop's authority import");
      },
    },
  ];
}
