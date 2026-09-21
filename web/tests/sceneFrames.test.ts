// @vitest-environment node
import { expect, test, vi } from "vitest";
import { createSceneFrames, startSceneFrames } from "../src/shared/sceneFrames";

test("synchronous frames schedule directly; async frames schedule only after completion", async () => {
  const callbacks: ((now: number) => void)[] = [],
    fail = vi.fn();
  let resume!: () => void;
  const frame = vi
    .fn()
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce(
      new Promise<void>((r) => {
        resume = r;
      }),
    );
  const stop = startSceneFrames(frame, (cb) => callbacks.push(cb), fail);
  expect(callbacks).toHaveLength(1);
  callbacks.shift()!(1);
  expect(frame).toHaveBeenCalledTimes(1);
  expect(callbacks).toHaveLength(1);
  callbacks.shift()!(2);
  expect(callbacks).toHaveLength(0);
  resume();
  await Promise.resolve();
  expect(callbacks).toHaveLength(1);
  stop();
  callbacks.shift()!(3);
  expect(frame).toHaveBeenCalledTimes(2);
  expect(fail).not.toHaveBeenCalled();
});
test("frame rejection is reported once and does not schedule another frame", async () => {
  const callbacks: ((now: number) => void)[] = [],
    fail = vi.fn(),
    error = Error("submission failed");
  startSceneFrames(
    () => Promise.reject(error),
    (cb) => callbacks.push(cb),
    fail,
  );
  callbacks.shift()!(1);
  await Promise.resolve();
  expect(fail).toHaveBeenCalledWith(error);
  expect(callbacks).toHaveLength(0);
});
test("exit aborts immediately, excludes overlapping frames, and drains before resource release", async () => {
  let resume!: () => void;
  const release = vi.fn(),
    abort = vi.fn(),
    work = vi.fn(
      () =>
        new Promise<void>((r) => {
          resume = r;
        }),
    );
  const owner = createSceneFrames(work, abort, release);
  const pending = owner.frame(1);
  owner.frame(2);
  expect(work).toHaveBeenCalledTimes(1);
  const exited = owner.exit();
  expect(abort).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  owner.frame(3);
  resume();
  await pending;
  await exited;
  expect(release).toHaveBeenCalledTimes(1);
  expect(work).toHaveBeenCalledTimes(1);
  await owner.exit();
  expect(release).toHaveBeenCalledTimes(1);
});
test("a switch requested inside a synchronous frame drains after that stack without deadlocking", async () => {
  const { switchScene, currentScene } = await import("../src/scene");
  const events: string[] = [];
  let transition: void | Promise<void> = undefined;
  const next = { enter: () => events.push("next-enter"), exit() {}, frame() {} };
  const owner = createSceneFrames(
    () => {
      events.push("frame");
      transition = switchScene(next);
      events.push("unwind");
    },
    () => events.push("abort"),
    () => events.push("release"),
  );
  const first = { enter: () => events.push("first-enter"), exit: owner.exit, frame: owner.frame };
  await switchScene(first);
  expect(currentScene()).toBe(first);
  first.frame(1);
  await transition;
  expect(events).toEqual(["first-enter", "frame", "abort", "unwind", "release", "next-enter"]);
  expect(currentScene()).toBe(next);
});
test("pending scene switches wait for old work and preserve menu/campaign ordering", async () => {
  const { switchScene, currentScene } = await import("../src/scene");
  let resume!: () => void;
  const events: string[] = [];
  const owner = createSceneFrames(
    () =>
      new Promise<void>((r) => {
        resume = r;
      }),
    () => events.push("abort"),
    () => events.push("release"),
  );
  await switchScene({ enter() {}, exit: owner.exit, frame: owner.frame });
  const frame = owner.frame(1);
  const menu = {
    enter: () => events.push("menu-enter"),
    exit: () => {
      events.push("menu-exit");
    },
    frame() {},
  };
  const campaign = { enter: () => events.push("campaign-enter"), exit() {}, frame() {} };
  const a = switchScene(menu),
    b = switchScene(campaign);
  expect(currentScene()).toBeNull();
  expect(events).toEqual(["abort"]);
  resume();
  await frame;
  await a;
  await b;
  expect(events).toEqual(["abort", "release", "menu-enter", "menu-exit", "campaign-enter"]);
});
test("frame and teardown failures remain observable after the exit barrier", async () => {
  let reject!: (error: unknown) => void;
  const failure = Error("frame failure"),
    cleanup = Error("cleanup failure");
  const owner = createSceneFrames(
    () =>
      new Promise<void>((_, r) => {
        reject = r;
      }),
    () => {},
    () => {
      throw cleanup;
    },
  );
  const pending = owner.frame(1) as Promise<void>,
    exited = owner.exit() as Promise<void>;
  const frameError = pending.catch((e) => e),
    exitError = exited.catch((e) => e);
  reject(failure);
  expect((await frameError).errors).toEqual([failure, cleanup]);
  expect(await exitError).toBe(cleanup);
});
