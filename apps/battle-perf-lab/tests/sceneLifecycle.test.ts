/// <reference path="../../../web/node_modules/vitest/globals.d.ts" />
import { createSceneLifecycle } from "../../../packages/battle-renderer/src/sceneLifecycle";
test("pending operation excludes concurrency and closes before deferred cleanup", async () => {
  const release = vi.fn(),
    life = createSceneLifecycle(release);
  let finish!: () => void;
  const pending = life.run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await expect(life.run(() => {})).rejects.toThrow("in flight");
  expect(() => life.idle()).toThrow("in flight");
  life.dispose();
  life.dispose();
  expect(release).not.toHaveBeenCalled();
  expect(() => life.check()).toThrow("disposed");
  finish();
  await expect(pending).rejects.toThrow("disposed");
  expect(release).toHaveBeenCalledOnce();
});
test("cleanup preserves the original operation rejection and still settles the owned promise", async () => {
  const original = Error("upload"),
    cleanup = Error("cleanup");
  const life = createSceneLifecycle(() => {
    throw cleanup;
  });
  let reject!: (error: Error) => void;
  const pending = life.run(
    () =>
      new Promise<void>((_, no) => {
        reject = no;
      }),
  );
  life.dispose();
  reject(original);
  const error = await pending.catch((error) => error);
  expect(error).toBeInstanceOf(AggregateError);
  expect(error.errors).toEqual([original, cleanup]);
});
test("failed operations permit retry; completed operations retain their return value", async () => {
  const release = vi.fn(),
    life = createSceneLifecycle(release);
  await expect(
    life.run(() => {
      throw Error("staging");
    }),
  ).rejects.toThrow("staging");
  expect(await life.run(() => 42)).toBe(42);
  expect(life.busy).toBe(false);
  life.dispose();
  expect(release).toHaveBeenCalledOnce();
});
