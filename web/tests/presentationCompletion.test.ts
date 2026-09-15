// @vitest-environment node
import { expect, test, vi } from "vitest";
import {
  completeBattlePresentation,
  reportBattlePresentationFailure,
} from "../src/battle/presentationCompletion";
import type { BattlePresentationReceipt } from "../src/battle/renderer";
const receipt = (cpuMs: number): BattlePresentationReceipt => ({
  submitted: true,
  renderedFrameId: 1,
  gpuSubmission: null,
  submittedAtMs: 107,
  cpuMs,
});
test("synchronous source completion remains synchronous with zero await duration", () => {
  let time = 4;
  const complete = vi.fn();
  const pending = completeBattlePresentation(
    0,
    new AbortController().signal,
    () => {
      time = 7;
      return receipt(3);
    },
    complete,
    () => time,
  );
  expect(pending).toBeUndefined();
  expect(complete).toHaveBeenCalledWith(receipt(3), {
    renderCpuMs: 7,
    renderAwaitMs: 0,
    renderWallMs: 7,
    asyncRenderCpuMs: 0,
  });
});
test("delayed completion separates active renderer CPU from suspension without counting a pending submission", async () => {
  let time = 4,
    resume!: (r: BattlePresentationReceipt) => void;
  const complete = vi.fn();
  const pending = completeBattlePresentation(
    0,
    new AbortController().signal,
    () => {
      time = 7;
      return new Promise((r) => {
        resume = r;
      });
    },
    complete,
    () => time,
  );
  expect(complete).not.toHaveBeenCalled();
  time = 107;
  resume(receipt(8));
  await pending;
  expect(complete).toHaveBeenCalledWith(receipt(8), {
    renderCpuMs: 12,
    renderAwaitMs: 100,
    renderWallMs: 107,
    asyncRenderCpuMs: 5,
  });
});
test("cancellation suppresses late Game/HUD consumers while rejection remains observable", async () => {
  let resume!: (r: BattlePresentationReceipt) => void;
  const complete = vi.fn(),
    abort = new AbortController();
  const pending = completeBattlePresentation(
    0,
    abort.signal,
    () =>
      new Promise((r) => {
        resume = r;
      }),
    complete,
    () => 0,
  );
  abort.abort();
  resume(receipt(0));
  await pending;
  expect(complete).not.toHaveBeenCalled();
  const error = Error("upload failed");
  await expect(
    completeBattlePresentation(
      0,
      new AbortController().signal,
      () => Promise.reject(error),
      complete,
    ),
  ).rejects.toBe(error);
  expect(complete).not.toHaveBeenCalled();
});

test("teardown suppresses cancellation but keeps unrelated asynchronous failures observable", () => {
  const abort = new AbortController(),
    report = vi.fn(),
    error = Error("upload failed during teardown");
  reportBattlePresentationFailure(error, abort.signal, report);
  expect(report).toHaveBeenCalledWith(error);
  report.mockClear();
  abort.abort();
  expect(() =>
    reportBattlePresentationFailure(abort.signal.reason, abort.signal, report),
  ).not.toThrow();
  expect(() => reportBattlePresentationFailure(error, abort.signal, report)).toThrow(error);
  expect(report).not.toHaveBeenCalled();
});
