import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { marchingStateForSpeed } from "../../../../../packages/crowd-runtime/src/animationState";
import {
  sampleRigLocalPose,
  blendLocalPoses,
  composeMaskedLocals,
} from "../../../../../packages/soldier-assets/src/localPose";
import {
  ActionTimeline,
  evaluatePlaybackPose,
} from "../../../../../packages/crowd-runtime/src/actionTimeline";
import {
  PlaybackPacker,
  PLAYBACK_WORDS,
} from "../../../../../packages/renderer-core/src/playbackPacking";
import { loadAppearanceCatalog } from "../../../../../packages/soldier-assets/src/appearanceBundle";
import {
  syntheticBudgetFixture,
  staggeredBudgetObservations,
} from "../../../../../web/scenes/models/_synthetic-budget-fixture";

const timelinePath = resolve("packages/crowd-runtime/src/actionTimeline.ts");
const originalSource = await readFile(timelinePath, "utf8");
const replacements = [
  [
    "return (appearance: PlaybackAppearance, playback: SoldierPlayback): PoseSource => {",
    "return (appearance: PlaybackAppearance, playback: SoldierPlayback): PoseSource => { diagnostic.requests++;",
  ],
  [
    "const source: PoseSource = Object.freeze({",
    "diagnostic.misses++; const started = performance.now(); const source: PoseSource = Object.freeze({",
  ],
  [
    "const entry = second ?? { appearance, playback, source };",
    "diagnostic.captureMs += performance.now() - started; const entry = second ?? { appearance, playback, source };",
  ],
];
let instrumented = originalSource;
for (const [before, after] of replacements) {
  assert.equal(instrumented.split(before).length, 2);
  instrumented = instrumented.replace(before, after);
}
instrumented += "\nexport const diagnostic = { requests: 0, misses: 0, captureMs: 0 };\n";
instrumented = instrumented.replace(
  /from "(\.[^"]+)"/g,
  (_, relative) => `from "${resolve(dirname(timelinePath), relative)}.ts"`,
);
const js = new Bun.Transpiler({ loader: "ts" })
  .transformSync(instrumented)
  .replace(/import\s+\{[\s\S]*?\}\s+from\s+"[^"]+";/g, "")
  .replace(/export /g, "");
const counted = new Function(
  "marchingStateForSpeed",
  "sampleRigLocalPose",
  "blendLocalPoses",
  "composeMaskedLocals",
  js + ";return { ActionTimeline, diagnostic };",
)(marchingStateForSpeed, sampleRigLocalPose, blendLocalPoses, composeMaskedLocals);
globalThis.fetch = async (url) =>
  new Response(
    await readFile(resolve("packages/soldier-assets/assets" + new URL(String(url)).pathname)),
  );
const catalog = await loadAppearanceCatalog(
  "http://fixture/candidates/blender-reference/catalog.json",
);
const appearance = syntheticBudgetFixture(catalog[41], {
  subdivisions: [3, 1, 0],
  jointCopies: 8,
  influences: 4,
  keySubdivisions: 2,
});
assert.equal(appearance.rig.bones.length, 67);
const appearances = { 41: appearance };
let checkedFrames = 0,
  checkedControlWords = 0,
  checkedPoses = 0;
function synchronized(count, tick) {
  const cycle = tick % 60;
  const lastRelease = [10, 11, 14, 15, 18].findLast((event) => event <= cycle);
  const age = lastRelease === undefined ? Infinity : (cycle - lastRelease) / 30;
  return Array.from({ length: count }, () => ({
    appearanceId: 41,
    alive: true,
    health: 100,
    mountHealth: 100,
    speedMps: 1,
    forwardMps: 1,
    lateralMps: 0,
    running: (cycle >= 4 && cycle < 23) || cycle >= 25,
    atEase: false,
    pikeReady: false,
    fighting: false,
    releaseTtl: Math.max(0, 0.5 - age),
    releaseAgeSeconds: Number.isFinite(age) ? age : 0,
  }));
}
const results = [];
for (const [mode, count, end] of [
  ["synchronized-small", 9, 60],
  ["synchronized-full", 30000, 60],
  ["staggered-positive-control", 9, 24],
] as const) {
  const baseline = new ActionTimeline(appearances),
    probe = new counted.ActionTimeline(appearances);
  const packers = [
    new PlaybackPacker(appearance.rig, appearance.animation),
    new PlaybackPacker(appearance.rig, appearance.animation),
  ];
  const stores = [new Uint32Array(count * PLAYBACK_WORDS), new Uint32Array(count * PLAYBACK_WORDS)];
  const rows = [];
  for (let tick = 0; tick <= end; tick++) {
    const observations = mode.startsWith("staggered")
      ? staggeredBudgetObservations(count, tick, 41)
      : synchronized(count, tick);
    Object.assign(counted.diagnostic, { requests: 0, misses: 0, captureMs: 0 });
    baseline.update(tick, observations);
    const start = performance.now();
    probe.update(tick, observations);
    const updateMs = performance.now() - start;
    const row = { tick, ...counted.diagnostic, updateMs, frames: [] };
    for (const fraction of [0, 0.5]) {
      const samples = [baseline.sample(tick + fraction), probe.sample(tick + fraction)];
      const frames = packers.map((packer, i) =>
        packer.prepare(
          count,
          (index) => samples[i][index],
          () => 17,
          stores[i],
        ),
      );
      assert.deepEqual(frames[1], frames[0]);
      checkedFrames++;
      checkedControlWords += frames[0].controls.length;
      if (count === 9)
        for (let i = 0; i < count; i++) {
          assert.deepEqual(samples[1][i], samples[0][i]);
          assert.deepEqual(
            evaluatePlaybackPose(appearance, samples[1][i]),
            evaluatePlaybackPose(appearance, samples[0][i]),
          );
          checkedPoses++;
        }
      row.frames.push({
        fraction,
        uploads: frames[1].uploads.length,
        uploadBytes: frames[1].uploads.reduce((sum, x) => sum + x.data.byteLength, 0),
        resident: frames[1].residentSnapshotCount,
        required: frames[1].requiredSnapshotSlots,
      });
      packers.forEach((packer, i) => packer.commitPrepared(frames[i]));
    }
    rows.push(row);
  }
  results.push({
    mode,
    count,
    rows,
    requests: rows.reduce((s, r) => s + r.requests, 0),
    misses: rows.reduce((s, r) => s + r.misses, 0),
    captureMs: rows.reduce((s, r) => s + r.captureMs, 0),
  });
}
console.log(
  JSON.stringify(
    {
      sourceSha256: createHash("sha256").update(originalSource).digest("hex"),
      runtime: Bun.version,
      checkedFrames,
      checkedControlWords,
      checkedPoses,
      results,
    },
    null,
    2,
  ),
);
