// @vitest-environment node
import { expect, test } from "vitest";
import {
  BattleGrassResidency,
  takeGrassPublications,
  beginGrassPublicationCapture,
  beginGrassPublicationReplay,
  queueGrassPublications,
  assertGrassPublicationsConsumed,
  productionBladeFieldProfile,
  initialBladeFieldTransition,
} from "../../apps/battle-perf-lab/src/CaptureGrassResidency";
import { flatHeightField } from "@packages/game-renderer/src/terrain/heightField";

test("publication replay preserves a pending ring until the recorded publication, without running its sampler", () => {
  const profile = productionBladeFieldProfile();
  const scheduled: (() => void)[] = [];
  let now = 0;
  const source = new BattleGrassResidency(profile, initialBladeFieldTransition(profile), () => {}, {
    now: () => (now += 0.5),
    schedule: (callback) => scheduled.push(callback),
  });
  const camera = {
    target: [0, 0, 0] as [number, number, number],
    distance: 32,
    pitch: 0.8,
    yaw: 0,
    fovY: Math.PI / 4,
    aspect: 1.5,
    near: 0.1,
    far: 2000,
  };
  source.setTerrain(
    {
      w: 16,
      h: 16,
      cell: 4,
      ox: -32,
      oy: -32,
      height: new Float32Array(256),
      tint: new Uint8Array(256),
      speed: new Float32Array(256),
      rough: new Float32Array(256),
    },
    flatHeightField(-32, -32, 16, 16, 4),
    "green-grass",
  );
  beginGrassPublicationCapture();
  source.prepareRender(camera, 900);
  const pending = takeGrassPublications();
  expect(pending[0].stats.rebuild.pending).toBe(true);
  source.prepareRender(camera, 900);
  const unchanged = takeGrassPublications();
  expect(unchanged[0].records).toEqual({});
  source.settle();
  source.prepareRender(camera, 900);
  const published = takeGrassPublications();
  expect(published[0].records.ring!.length).toBeGreaterThan(0);
  const live = source.snapshot().ring;
  const expected = live.records!.slice(0, live.recordCount * 16);
  const liveCount = live.recordCount;
  source.dispose();
  beginGrassPublicationReplay();
  let notifications = 0;
  const replay = new BattleGrassResidency(
    profile,
    initialBladeFieldTransition(profile),
    () => notifications++,
    {
      now: () => {
        throw Error("Replay clock used");
      },
      schedule: () => {
        throw Error("Replay sampler scheduled");
      },
    },
  );
  try {
    for (const batch of [pending, unchanged]) {
      queueGrassPublications(batch);
      replay.prepareRender(camera, 900);
      assertGrassPublicationsConsumed();
      expect(batch).toHaveLength(1);
      expect(replay.stats().rebuild.pending).toBe(true);
    }
    queueGrassPublications(published);
    replay.prepareRender(camera, 900);
    assertGrassPublicationsConsumed();
    const replayed = replay.snapshot().ring;
    expect(replayed.recordCount).toBe(liveCount);
    expect(replayed.records!.slice(0, liveCount * 16)).toEqual(expected);
    expect(replay.stats().rebuild.pending).toBe(false);
    expect(notifications).toBe(3);
    expect(() => replay.prepareRender(camera, 900)).toThrow(/uncaptured/);
  } finally {
    replay.dispose();
  }
});

test("grass record chunks preserve exact bytes without embedding a large revision in frame JSON", async () => {
  const { chunkGrassPublications, GRASS_CHUNK_BYTES } =
    await import("../../apps/battle-perf-lab/src/grassRecordChunks");
  const records = new Float32Array(GRASS_CHUNK_BYTES / 4 + 3);
  records[0] = -0;
  records[1] = Infinity;
  records[records.length - 1] = 1.25;
  const expected = new Uint8Array(records.buffer).slice();
  const result = chunkGrassPublications([
    { state: { base: { revision: 2 } }, records: { base: records }, edits: {} } as never,
  ]);
  expect(result.resources.map((r) => r.blob.size)).toEqual([GRASS_CHUNK_BYTES, 12]);
  expect(JSON.stringify(result.frames).length).toBeLessThan(256);
  records.fill(99);
  const actual = new Uint8Array(await new Blob(result.resources.map((r) => r.blob)).arrayBuffer());
  expect(firstDifference(actual, expected)).toBe(-1);
});

/** Byte index where two buffers first differ, or -1. Four megabytes of records
 *  are cheap to round-trip and cheap to compare, but structural equality over
 *  four million elements is neither - and it reports a four megabyte diff. */
function firstDifference(actual: Uint8Array, expected: Uint8Array): number {
  if (actual.length !== expected.length) return Math.min(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) return i;
  return -1;
}

test("a publication step is chunked as its own ranges, not as the whole field again", async () => {
  const { chunkGrassPublications, GRASS_CHUNK_BYTES } =
    await import("../../apps/battle-perf-lab/src/grassRecordChunks");
  const data = new Float32Array(32).fill(3);
  const result = chunkGrassPublications([
    {
      state: { base: { revision: 2 }, ring: { revision: 5 } },
      records: {},
      edits: { ring: { editSerial: 9, ranges: [{ start: 4, count: 2 }], data } },
    } as never,
  ]);
  expect(result.resources).toHaveLength(1);
  expect(result.resources[0].blob.size).toBe(data.byteLength);
  expect(result.resources[0].blob.size).toBeLessThan(GRASS_CHUNK_BYTES);
  expect(result.frames[0].edits.ring).toMatchObject({
    editSerial: 9,
    ranges: [{ start: 4, count: 2 }],
    data: { grassRecord: "ring-edit-9", byteLength: data.byteLength, chunks: 1 },
  });
});
