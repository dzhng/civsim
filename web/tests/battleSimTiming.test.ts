// @vitest-environment node
import { expect, test } from "vitest";
import { ACTION_TICK_SECONDS } from "@packages/crowd-runtime/src/actionTimeline";
import { BATTLE_TICK_MS, BATTLE_TICK_SECONDS } from "../src/battle/sim/simTiming";

test("the authority's timestep is the same number the animation side calls a tick", () => {
  // The authority holds its own copy so a worker never pulls in the animation
  // graph. Nothing else keeps the two honest, so this does.
  expect(BATTLE_TICK_SECONDS).toBe(ACTION_TICK_SECONDS);
  expect(BATTLE_TICK_MS).toBe(ACTION_TICK_SECONDS * 1000);
});
