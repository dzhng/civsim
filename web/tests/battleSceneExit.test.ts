// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ enter: vi.fn() }));
vi.mock("../src/battle/battleLoop", () => ({ enterBattleScene: state.enter }));
import { BattleScene, type BattleConfig } from "../src/battle/scene";
import { completeBattlePresentation } from "../src/battle/presentationCompletion";
import type { BattlePresentationReceipt } from "../src/battle/renderer";
afterEach(() => {
  vi.unstubAllGlobals();
  state.enter.mockReset();
});
test("battle exit aborts pending presentation before any HUD/Game cleanup and frees exactly once after drain", async () => {
  vi.stubGlobal("window", { __ready: true });
  const events: string[] = [],
    game = { free: vi.fn(() => events.push("free")) },
    hud = vi.fn();
  let resume!: (value: BattlePresentationReceipt) => void, signal!: AbortSignal;
  state.enter.mockImplementation((_cfg, cleanups, _restart, incoming) => {
    signal = incoming;
    cleanups.push(() => events.push("cleanup"));
    return () =>
      completeBattlePresentation(
        0,
        signal,
        () =>
          new Promise((r) => {
            resume = r;
          }),
        hud,
        () => 0,
      );
  });
  const scene = new BattleScene({ game } as unknown as BattleConfig);
  scene.enter();
  const frame = scene.frame(1),
    exit = scene.exit();
  expect(signal.aborted).toBe(true);
  expect(events).toEqual([]);
  expect(window.__ready).toBe(false);
  resume({ submitted: true, renderedFrameId: 1, gpuSubmission: null, submittedAtMs: 0, cpuMs: 0 });
  await frame;
  await exit;
  expect(hud).not.toHaveBeenCalled();
  expect(events).toEqual(["cleanup", "free"]);
  await scene.exit();
  expect(game.free).toHaveBeenCalledTimes(1);
});
