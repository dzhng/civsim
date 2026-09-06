import { test } from "vitest";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  ActionTimeline as MemoTimeline,
  evaluatePlaybackPose,
} from "../../../../../packages/crowd-runtime/src/actionTimeline";
import { ActionTimeline } from "baseline-timeline";
import { loadAppearanceCatalog } from "../../../../../packages/soldier-assets/src/appearanceBundle";
import { mountedTemporalFixture } from "../../../../../web/scenes/models/_mounted-temporal-fixture";
globalThis.fetch = async (url) =>
  new Response(
    await readFile(
      new URL(
        "../../../../../packages/soldier-assets/assets" + new URL(String(url)).pathname,
        import.meta.url,
      ),
    ),
  );
const assets = await loadAppearanceCatalog("http://fixture/catalog.json");
const diagnostics = await loadAppearanceCatalog(
  "http://fixture/candidates/blender-reference/catalog.json",
);
assets[41] = mountedTemporalFixture(diagnostics[41]);
test("timeline update preserves exact poses versus a pinned controller", () => {
  for (let repeat = 0; repeat < 3; repeat++)
    for (const id of [4, 41])
      for (const mode of ["synchronized", "interleaved"]) {
        const original = new ActionTimeline(assets),
          memo = new MemoTimeline(assets);
        const obs = Array.from({ length: 30000 }, () => ({
          appearanceId: id,
          alive: true,
          health: 100,
          mountHealth: 100,
          speedMps: 1,
          running: false,
          atEase: false,
          pikeReady: false,
          fighting: false,
          releaseTtl: 0,
          releaseAgeSeconds: 0,
        }));
        for (const tick of [0, 1, 4, 8, 10, 11, 14]) {
          for (let i = 0; i < obs.length; i++) {
            const o = obs[i];
            o.running = tick >= 4 && (mode === "synchronized" || (i + tick) % 3 !== 0);
            o.releaseTtl = tick >= 10 ? 0.5 : 0;
            o.releaseAgeSeconds = mode === "synchronized" ? 0 : (i % 17) / 100;
          }
          let aMs, bMs;
          const runA = () => {
            const t = performance.now();
            original.update(tick, obs);
            aMs = performance.now() - t;
          };
          const runB = () => {
            const t = performance.now();
            memo.update(tick, obs);
            bMs = performance.now() - t;
          };
          if (repeat % 2) {
            runB();
            runA();
          } else {
            runA();
            runB();
          }
          const a = original.sample(tick), b = memo.sample(tick);
          const unique = new Set();
          for (let i = 0; i < obs.length; i++) {
            assert.deepEqual(
              evaluatePlaybackPose(assets[id], a[i]),
              evaluatePlaybackPose(assets[id], b[i]),
            );
            if (b[i].base.source.kind === "frozen") unique.add(b[i].base.source);
            if (b[i].riderUpperBody?.source.kind === "frozen")
              unique.add(b[i].riderUpperBody.source);
          }
          process.stdout.write(
            JSON.stringify({
              repeat,
              id,
              mode,
              tick,
              aMs,
              bMs,
              uniqueFrozen: unique.size,
              verifiedPoses: obs.length,
            }) + "\n",
          );
        }
      }
});
