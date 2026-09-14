// @vitest-environment node
import { expect, test } from "vitest";
import { consumeReplayFrames } from "../../apps/battle-perf-lab/src/replayFrames";

test("the replay consumes a bounded prefix and closes the source without reading ahead", async () => {
  let produced = 0;
  let closed = false;
  async function* source() {
    try {
      for (let frameId = 0; frameId < 10; frameId++) {
        produced++;
        yield { frameId };
      }
    } finally {
      closed = true;
    }
  }
  const seen: number[] = [];
  const result = await consumeReplayFrames(source(), 2, (frame) => {
    seen.push(frame.frameId);
  });
  expect(seen).toEqual([0, 1]);
  expect(produced).toBe(2);
  expect(closed).toBe(true);
  expect(result).toEqual({ frames: 2, stopped: "frame-limit" });
});

test("invalid frame limits fail before touching the source", async () => {
  let produced = 0;
  async function* source() {
    produced++;
    yield { frameId: 1 };
  }
  for (const limit of [0, -1, 0.5, Infinity, NaN]) {
    await expect(consumeReplayFrames(source(), limit, () => {})).rejects.toThrow(RangeError);
  }
  expect(produced).toBe(0);
});

test("source delivery waits for observation and failures close the source", async () => {
  let produced = 0;
  let closed = false;
  let begin!: () => void;
  let fail!: (error: Error) => void;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const pending = new Promise<void>((_resolve, reject) => {
    fail = reject;
  });
  async function* source() {
    try {
      while (true) {
        produced++;
        yield { frameId: produced };
      }
    } finally {
      closed = true;
    }
  }
  const run = consumeReplayFrames(source(), 10, () => {
    begin();
    return pending;
  });
  await started;
  expect(produced).toBe(1);
  const failure = new Error("evidence sink failed");
  fail(failure);
  await expect(run).rejects.toBe(failure);
  expect(produced).toBe(1);
  expect(closed).toBe(true);
});

test("an exhausted recording reports source completion separately from the frame cap", async () => {
  async function* source() {
    yield { frameId: 9 };
  }
  const seen: number[] = [];
  const result = await consumeReplayFrames(source(), 3, (frame) => {
    seen.push(frame.frameId);
  });
  expect(seen).toEqual([9]);
  expect(result).toEqual({ frames: 1, stopped: "source-ended" });
});
