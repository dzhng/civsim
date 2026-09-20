import { afterEach, expect, it } from "vitest";
import { installBattleDebugApi, type BattleLoopFrameMetrics } from "./battleDebugApi";

afterEach(() => {
  window.__game = undefined;
  window.__cam = undefined;
});

it("reads raw completed frame snapshots without traversing full game or renderer stats", () => {
  let current: BattleLoopFrameMetrics | null = null;
  // Only the authority's published identity is needed during installation. Unused
  // owners stay absent so accidental full-stat collection fails instead of being
  // masked.
  installBattleDebugApi({
    owners: {},
    sim: { stride: 35, stateHash: () => "18446744073709551615" },
    frameMetrics: () => current,
  } as unknown as Parameters<typeof installBattleDebugApi>[0]);
  const api = window.__game as {
    frameMetrics(): BattleLoopFrameMetrics | null;
    stateHash(): string;
  };
  expect(api.frameMetrics()).toBeNull();
  current = {
    frameId: 2,
    timestampMs: 750,
    intervalMs: 510.125,
    ready: true,
    simTick: 12,
    ticksAdvanced: 3,
    simCpuMs: 4.123456,
    renderCpuMs: 6.234567,
    renderAwaitMs: 0,
    renderWallMs: 6.234567,
    loopCpuMs: 12.345678,
    renderer: {
      renderedFrameId: 1,
      gpuSubmission: { submissionId: 7, threeFrameId: 17, source: "battle-draw" },
      skippedFrozenFrame: false,
      buildMs: 2.123456,
      uploadMs: 1,
      drawMs: 2,
      frameCpuMs: 5.123456,
    },
  };
  const retained = api.frameMetrics()!;
  expect(retained.intervalMs).toBe(510.125);
  expect(retained.simCpuMs).toBe(4.123456);
  expect(retained.renderer.buildMs).toBe(2.123456);
  current = {
    ...current,
    frameId: 3,
    ticksAdvanced: 0,
    simCpuMs: 0,
    renderer: { ...current.renderer, skippedFrozenFrame: true },
  };
  expect(api.frameMetrics()!.frameId).toBe(3);
  expect(api.frameMetrics()!.renderer.renderedFrameId).toBe(1);
  expect(retained.frameId).toBe(2);
  retained.renderer.renderedFrameId = 99;
  retained.renderer.gpuSubmission!.submissionId = 999;
  expect(api.frameMetrics()!.renderer.gpuSubmission!.submissionId).toBe(7);
  expect(api.frameMetrics()!.renderer.renderedFrameId).toBe(1);
  expect(api.stateHash()).toBe("18446744073709551615");
});

it("forwards an explicit seating inspection and reports null where a renderer owns none", async () => {
  const install = (renderer: unknown) =>
    installBattleDebugApi({
      owners: {},
      sim: { stride: 35 },
      frameMetrics: () => null,
      renderer,
    } as unknown as Parameters<typeof installBattleDebugApi>[0]);
  const api = () => window.__game as { verifySeating(): Promise<unknown> };
  // The source renderer measures nothing it could truthfully publish here.
  install({});
  await expect(api().verifySeating()).resolves.toBeNull();
  const inspection = { measurement: { checked: 4, matches: true }, unavailable: null };
  install({ verifySeating: async () => inspection });
  await expect(api().verifySeating()).resolves.toBe(inspection);
});
