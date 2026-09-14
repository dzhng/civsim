// @vitest-environment node
import { expect, test } from "vitest";
import { decodeReplayValue, encodeReplayValue } from "../../apps/battle-perf-lab/src/replayArchive";

test("archive encoding preserves typed-array bytes and detaches live source storage", async () => {
  const source = new Float32Array([1.25, NaN, -0, Infinity]);
  const before = new Uint8Array(source.buffer).slice();
  const encoded = encodeReplayValue({ positions: source, frameId: 4 });
  source[0] = 99;
  const decoded = await decodeReplayValue<{ positions: Float32Array; frameId: number }>(encoded);
  expect(decoded.positions).toBeInstanceOf(Float32Array);
  expect(new Uint8Array(decoded.positions.buffer)).toEqual(before);
  expect(decoded.frameId).toBe(4);
});

test("capture stops at its byte cap without retaining the overflowing frame", async () => {
  const { ReplayWindow } = await import("../../apps/battle-perf-lab/src/replayArchive");
  const frame = { frameId: 1, positions: new Float32Array([1, 2]) };
  const size = encodeReplayValue(frame).size;
  const window = new ReplayWindow(5, size);
  expect(window.append(frame)).toBe("recording");
  expect(window.append({ ...frame, frameId: 2 })).toBe("byte-limit");
  expect(window.frames).toHaveLength(1);
  expect(window.bytes).toBe(size);
  expect((await decodeReplayValue<typeof frame>(window.frames[0])).frameId).toBe(1);
});

test("asset encoding is stable across property insertion order and rejects opaque objects", async () => {
  expect(await encodeReplayValue({ b: 2, a: { y: 1, x: 0 } }).text()).toBe(
    await encodeReplayValue({ a: { x: 0, y: 1 }, b: 2 }).text(),
  );
  expect(() => encodeReplayValue({ texture: new Map() })).toThrow("plain");
});

test("long numeric pose arrays preserve double precision and nonfinite values compactly", async () => {
  const locals = Array.from({ length: 64 }, (_, index) => index / 7);
  locals[1] = -0;
  locals[2] = NaN;
  const encoded = encodeReplayValue({ locals });
  const decoded = await decodeReplayValue<{ locals: number[] }>(encoded);
  expect(decoded.locals).toEqual(locals);
  expect(Object.is(decoded.locals[1], -0)).toBe(true);
});

test("immutable frozen poses are stored once across soldiers and frames within the total cap", async () => {
  const { ReplayWindow } = await import("../../apps/battle-perf-lab/src/replayArchive");
  const locals = Object.freeze(Array.from({ length: 64 }, (_, index) => index / 7));
  const source = Object.freeze({ kind: "frozen", locals });
  const window = new ReplayWindow(3, 10000);
  window.append({ frameId: 1, sources: [source, source] });
  window.append({ frameId: 2, sources: [source] });
  expect(window.poses).toHaveLength(1);
  const poses = await Promise.all(window.poses.map((blob) => decodeReplayValue<number[]>(blob)));
  const decoded = await decodeReplayValue<{ sources: { kind: string; locals: number[] }[] }>(
    window.frames[0],
    poses,
  );
  expect(decoded.sources[0].locals).toEqual(locals);
  expect(decoded.sources[1].locals).toBe(decoded.sources[0].locals);
  expect(window.bytes).toBe(
    window.frames.reduce((n, blob) => n + blob.size, 0) + window.poses[0].size,
  );
});

test("overflowing pose definitions do not consume the static-inclusive window budget", async () => {
  const { ReplayWindow } = await import("../../apps/battle-perf-lab/src/replayArchive");
  const locals = Object.freeze(Array.from({ length: 64 }, (_, index) => index / 7));
  const staticBytes = 50;
  const window = new ReplayWindow(2, 100, staticBytes);
  expect(window.append({ pose: { kind: "frozen", locals } })).toBe("byte-limit");
  expect(window.frames).toHaveLength(0);
  expect(window.poses).toHaveLength(0);
  expect(window.bytes).toBe(staticBytes);
  expect(window.append({ frameId: 2 })).toBe("recording");
  expect(window.bytes).toBe(staticBytes + encodeReplayValue({ frameId: 2 }).size);
});
