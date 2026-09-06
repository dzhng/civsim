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
test("lazy prior capture preserves exact playback and posed output against pinned source", () => {
  const original = new ActionTimeline(assets),
    current = new MemoTimeline(assets);
  let verified = 0;
  for (const tick of [0, 1, 4, 8, 10, 11, 14, 15, 18, 24, 30, 40, 50, 60, 100, 2, 3]) {
    const observations = Array.from({ length: tick === 100 ? 2 : 4 }, (_, i) => ({
      appearanceId: tick >= 40 ? (i % 2 ? 4 : 41) : i % 2 ? 41 : 4,
      alive: tick < 60,
      health: tick >= 30 ? 80 : 100,
      mountHealth: 100,
      speedMps: tick === 0 ? 0 : 1,
      running: tick >= 4 && (tick + i) % 3 !== 0,
      atEase: false,
      pikeReady: false,
      fighting: false,
      releaseTtl: [10, 11, 14, 15, 18].includes(tick) ? 0.5 : 0,
      releaseAgeSeconds: i / 100,
    }));
    // Re-observing the same tick must remain inert as well as preserving transitions.
    for (let repeat = 0; repeat < 2; repeat++) {
      original.update(tick, observations);
      current.update(tick, observations);
      for (const fraction of [0, 0.25, 0.75]) {
        const expected = original.sample(tick + fraction),
          actual = current.sample(tick + fraction);
        assert.deepEqual(actual, expected);
        for (let i = 0; i < actual.length; i++) {
          const appearance = assets[actual[i].appearanceId];
          assert.deepEqual(
            evaluatePlaybackPose(appearance, actual[i]),
            evaluatePlaybackPose(appearance, expected[i]),
          );
          verified++;
        }
      }
    }
  }
  process.stdout.write(
    JSON.stringify({
      baseline: process.env.TIMELINE_PROFILE_BASE,
      exactPlaybackAndPoses: verified,
      timingClaim: false,
    }) + "\n",
  );
});
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
          const a = original.sample(tick),
            b = memo.sample(tick);
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
