import { afterEach, expect, it } from "vitest";
import { installBattleDebugApi, type BattleLoopFrameMetrics } from "./battleDebugApi";

afterEach(() => {
  window.__game = undefined;
  window.__cam = undefined;
});

it("reads raw completed frame snapshots without traversing full game or renderer stats", () => {
  let current: BattleLoopFrameMetrics | null = null;
  // Only the WASM memory boundary is needed during installation. Unused owners
  // stay absent so accidental full-stat collection fails instead of being masked.
  installBattleDebugApi({
    wasm: { memory: new WebAssembly.Memory({ initial: 1 }) },
    owners: {},
    game: { state_hash: () => 18446744073709551615n },
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
    loopCpuMs: 12.345678,
    renderer: {
      renderedFrameId: 1,
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
  expect(api.frameMetrics()!.renderer.renderedFrameId).toBe(1);
  expect(api.stateHash()).toBe("18446744073709551615");
});
