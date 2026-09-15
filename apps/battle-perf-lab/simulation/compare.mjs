import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const [directPath, workerPath, output] = process.argv.slice(2);
const direct = JSON.parse(await readFile(directPath, "utf8")),
  worker = JSON.parse(await readFile(workerPath, "utf8"));
assert.equal(direct.mode, "direct");
assert.equal(worker.mode, "worker");
assert.deepEqual(direct.identity.wasmSha256, worker.identity.wasmSha256);
assert.deepEqual(direct.identity.orders, worker.identity.orders);
assert.equal(direct.identity.classSpecs, worker.identity.classSpecs);
assert.equal(direct.identity.releaseDuration, worker.identity.releaseDuration);
const observations = (run) =>
  run.rows.map(
    ({ tick, hash, observationSha256, bytes, soldiers, projectiles, units, victor, ack }) => ({
      tick,
      hash,
      observationSha256,
      bytes,
      soldiers,
      projectiles,
      units,
      victor,
      ack,
    }),
  );
assert.deepEqual(observations(direct), observations(worker));
assert.deepEqual(
  worker.rows.filter((row) => row.ack).map((row) => row.ack),
  [{ seq: 1, tick: worker.command.tick }],
);
const summary = {
  kind: "cpu-publication-parity",
  comparedTicks: direct.rows.length,
  wasmSha256: direct.identity.wasmSha256,
  completedTickHashes: direct.rows
    .filter((row) => [9000, 9300, direct.endTick].includes(row.tick))
    .map(({ tick, hash }) => ({ tick, hash })),
  orderedCommand: worker.command,
  rawObservationParity: true,
  direct: direct.summary,
  worker: worker.summary,
  limitations: [
    "CPU-only Node diagnostic, no browser or renderer acceptance.",
    "Raw ActionAdapter inputs match; ActionAdapter/ActionTimeline execution and visible transient semantics remain unverified.",
    "Single-credit backpressure deliberately slows simulation under a slow consumer.",
    "One measured pair, no stable throughput or main-thread responsiveness conclusion.",
    "See separate control report; sequential single runs cannot isolate publication overhead from runtime variance.",
  ],
};
await writeFile(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
