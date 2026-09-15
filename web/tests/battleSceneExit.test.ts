// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ enter: vi.fn(), dispose: vi.fn() }));
vi.mock("../src/battle/battleLoop", () => ({ enterBattleScene: state.enter }));
vi.mock("../src/battle/sim/battleSimClient", () => ({
  BattleSimClient: class {
    dispose = state.dispose;
  },
}));
import { BattleScene, type BattleConfig } from "../src/battle/scene";
import { completeBattlePresentation } from "../src/battle/presentationCompletion";
import type { BattlePresentationReceipt } from "../src/battle/renderer";
afterEach(() => {
  vi.unstubAllGlobals();
  state.enter.mockReset();
  state.dispose.mockReset();
});
test("battle exit aborts pending presentation before any HUD/authority cleanup and disposes exactly once after drain", async () => {
  vi.stubGlobal("window", { __ready: true });
  const events: string[] = [],
    hud = vi.fn();
  state.dispose.mockImplementation(() => {
    events.push("dispose");
    return Promise.resolve();
  });
  let resume!: (value: BattlePresentationReceipt) => void, signal!: AbortSignal;
  state.enter.mockImplementation((_cfg, _sim, cleanups, _restart, incoming) => {
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
  const scene = new BattleScene({ setup: {} } as unknown as BattleConfig);
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
  expect(events).toEqual(["cleanup", "dispose"]);
  await scene.exit();
  expect(state.dispose).toHaveBeenCalledTimes(1);
});
