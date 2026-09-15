// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  instrumentThreeTimestampReadback,
  sourceTimestampTapPlugin,
} from "../../apps/battle-perf-lab/src/source/timestampTap";
const code = readFileSync(
  new URL("../node_modules/three/build/three.webgpu.js", import.meta.url),
  "utf8",
);
it("adds only the CPU range callback to the exact pinned WebGPU readback, preserving all GPU calls and WebGL source", () => {
  const out = instrumentThreeTimestampReadback(code, "/ledger.ts");
  const prefix =
    'import { enableSourceTimestampRanges, recordSourceTimestampRange } from "/ledger.ts";\nenableSourceTimestampRanges();\n';
  const tap =
    "\n\t\t\t\trecordSourceTimestampRange( this.device, this.type, uid, startTime, endTime );";
  expect(out.startsWith(prefix)).toBe(true);
  expect(out.split(tap)).toHaveLength(2);
  expect(out.slice(prefix.length).replace(tap, "")).toBe(code);
  expect(out.indexOf(tap)).toBeGreaterThan(out.indexOf("class WebGPUTimestampQueryPool"));
  expect(sourceTimestampTapPlugin().transform(code, "/three/build/three.module.js")).toBeNull();
});
it("rejects a changed pinned bundle instead of silently instrumenting a different implementation", () => {
  expect(() => instrumentThreeTimestampReadback(code + "\n", "/ledger.ts")).toThrow(
    "digest mismatch",
  );
});
