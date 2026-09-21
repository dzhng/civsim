// @vitest-environment node
import { expect, test, vi } from "vitest";
import { BattleFreeze, BattlePresentationBarrier } from "../src/battle/battleFreeze";
import type { BattleRendererApi } from "../src/battle/battleRendererApi";

test("freeze settles the requested frozen presentation rather than the previous submitted view", async () => {
  let shownTick = 10;
  let complete!: () => void;
  const presentation = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const settled: number[] = [];
  const renderer = {
    fixedTime: null,
    preserveFrozenEffects: false,
    settlePresentedFrame: async () => {
      settled.push(shownTick);
    },
  } as unknown as BattleRendererApi;
  const freeze = new BattleFreeze(
    { paused: false, frozen: false, timeScale: 1 },
    renderer,
    () => {},
  );
  const finished = vi.fn();
  const pending = freeze
    .freezeAtTick(
      72,
      async () => {},
      () => {},
      () => presentation,
    )
    .then(finished);
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toEqual([]);
  expect(finished).not.toHaveBeenCalled();
  shownTick = 72;
  complete();
  await pending;
  expect(settled).toEqual([72]);
});

test("an older in-flight presentation cannot release a freeze waiting for a new packet", async () => {
  const barrier = new BattlePresentationBarrier(new AbortController().signal);
  const oldPacket = barrier.begin();
  const accepted = vi.fn();
  const waiting = barrier.waitForNext().then(accepted);
  barrier.complete(oldPacket);
  await Promise.resolve();
  expect(accepted).not.toHaveBeenCalled();
  const frozenPacket = barrier.begin();
  barrier.complete(frozenPacket);
  await waiting;
  expect(accepted).toHaveBeenCalledOnce();
});

test("scene cancellation rejects a waiting freeze without settling stale renderer state", async () => {
  const controller = new AbortController();
  const barrier = new BattlePresentationBarrier(controller.signal);
  const settle = vi.fn(async () => {});
  const freeze = new BattleFreeze(
    { paused: false, frozen: false, timeScale: 1 },
    { settlePresentedFrame: settle } as unknown as BattleRendererApi,
    () => {},
    controller.signal,
  );
  const pending = freeze.freezeAtTick(
    72,
    async () => {},
    () => {},
    () => barrier.waitForNext(),
  );
  const reason = new DOMException("Scene exited", "AbortError");
  const rejected = expect(pending).rejects.toBe(reason);
  await Promise.resolve();
  controller.abort(reason);
  await rejected;
  expect(settle).not.toHaveBeenCalled();
});

test("renderer failure or disposal rejects present and later freeze waiters", async () => {
  const barrier = new BattlePresentationBarrier(new AbortController().signal);
  const failure = Error("Renderer disposed during presentation");
  const waiting = barrier.waitForNext();
  const rejected = expect(waiting).rejects.toBe(failure);
  barrier.fail(failure);
  await rejected;
  barrier.complete(barrier.begin());
  await expect(barrier.waitForNext()).rejects.toBe(failure);
});
