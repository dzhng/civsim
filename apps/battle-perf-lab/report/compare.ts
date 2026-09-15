import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { compareRuns } from "./compareRuns";

const [mode, leftPath, rightPath, output] = process.argv.slice(2);
if (!["parity", "shadow-cost"].includes(mode) || !leftPath || !rightPath || !output)
  throw Error(
    "Usage: bun apps/battle-perf-lab/report/compare.ts parity|shadow-cost left.json right.json output.json (each input contains manifest and report)",
  );
const load = async (path: string) => {
  const bytes = await readFile(path);
  return {
    input: JSON.parse(bytes.toString()),
    artifact: { path: resolve(path), sha256: createHash("sha256").update(bytes).digest("hex") },
  };
};
const [left, right] = await Promise.all([load(leftPath), load(rightPath)]);
const scorecard = compareRuns(left.input, right.input, mode as "parity" | "shadow-cost");
await writeFile(
  output,
  JSON.stringify({ ...scorecard, inputs: [left.artifact, right.artifact] }, null, 2),
  { flag: "wx" },
);
if (!scorecard.eligible) process.exitCode = 1;
