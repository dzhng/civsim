/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
import { claimCanvas } from "../../../../../web/src/battle/canvasOwnership";
test("a cancelled queued replacement cannot let a third surface bypass the draining owner", async () => {
  const canvas = {};
  const first = claimCanvas(canvas),
    second = claimCanvas(canvas),
    third = claimCanvas(canvas);
  await first.ready;
  let admitted = false;
  const pending = third.ready.then(() => {
    admitted = true;
  });
  second.release();
  await Promise.resolve();
  expect(admitted).toBe(false);
  first.release();
  await pending;
  expect(admitted).toBe(true);
  third.release();
  const next = claimCanvas(canvas);
  await next.ready;
  next.release();
});
