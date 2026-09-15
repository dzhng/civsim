import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRun, clock, EXPECTED } from "./publication.mjs";
const [wasmDirectory, output] = process.argv.slice(2);
const run = await createRun(resolve(wasmDirectory));
try {
  for (let tick = 0; tick < 9000; tick += 30) run.game.advance_ticks(30);
  assert.equal(run.game.state_hash().toString(), EXPECTED[9000]);
  console.error(JSON.stringify({ ready: "control", tick: 9000, pid: process.pid }));
  if (process.env.PUBLICATION_GATE) {
    let granted = false;
    for (let attempt = 0; attempt < 2400; attempt++) {
      try {
        await readFile(process.env.PUBLICATION_GATE);
        granted = true;
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(granted, "quiet slot gate timeout");
  }
  // Uninstrumented window: no per-call clocks, hashes, copies or observers.
  const began = clock();
  for (let tick = 9000; tick < 9300; tick += 4) run.game.advance_ticks(4);
  const elapsedMs = Number(clock() - began) / 1e6;
  assert.equal(run.game.state_hash().toString(), EXPECTED[9300]);
  await writeFile(
    output,
    JSON.stringify(
      {
        kind: "cpu-publication-control",
        wasmSha256: run.wasmSha256,
        node: process.version,
        ticks: 300,
        batchTicks: 4,
        elapsedMs,
        ticksPerSecond: 300000 / elapsedMs,
        hash: EXPECTED[9300],
        diagnosticOnly: true,
      },
      null,
      2,
    ),
  );
} finally {
  run.game.free();
}
