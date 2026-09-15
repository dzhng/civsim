// @vitest-environment node
import { expect, test } from "vitest";
import { orderedSpoolQueue } from "../../apps/battle-perf-lab/src/orderedSpoolQueue";

test("worker drains already-delivered packets in order without another main-thread message", async () => {
  const seen: number[] = [];
  let release!: () => void;
  let active = 0,
    maxActive = 0;
  const queue = orderedSpoolQueue<number>(
    async (packet) => {
      active++;
      maxActive = Math.max(maxActive, active);
      seen.push(packet);
      if (packet === 1) await new Promise<void>((resolve) => (release = resolve));
      active--;
    },
    (error) => {
      throw error;
    },
  );
  queue.offer(1, 1);
  queue.offer(3, 3);
  queue.offer(2, 2);
  expect(seen).toEqual([1]);
  release();
  await expect.poll(() => seen).toEqual([1, 2, 3]);
  expect(maxActive).toBe(1);
});

test("worker failure drops queued writes and ignores later deliveries", async () => {
  const seen: number[] = [],
    failures: unknown[] = [];
  const failure = new Error("disk refused packet");
  const queue = orderedSpoolQueue<number>(
    async (packet) => {
      seen.push(packet);
      throw failure;
    },
    (error) => failures.push(error),
  );
  queue.offer(1, 1);
  queue.offer(2, 2);
  await expect.poll(() => failures).toEqual([failure]);
  queue.offer(3, 3);
  expect(seen).toEqual([1]);
});
