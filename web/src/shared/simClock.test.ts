// @vitest-environment node

import { describe, expect, it } from "vitest";

import { SimClock } from "./simClock";

describe("SimClock", () => {
  it("accumulates fractional ticks and reports interpolation alpha", () => {
    const clock = new SimClock({ tickHz: 10, maxTicksPerFrame: 4 });

    expect(clock.advance(1000)).toBe(0);
    expect(clock.advance(1050)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.5);
    expect(clock.advance(1100)).toBe(1);
    expect(clock.tick).toBe(1);
    expect(clock.alpha).toBeCloseTo(0);
  });

  it("caps work per frame and drops the excess backlog", () => {
    const clock = new SimClock({ tickHz: 100, maxTicksPerFrame: 4 });
    clock.advance(0);

    expect(clock.advance(250)).toBe(4);
    expect(clock.tick).toBe(4);
    expect(clock.alpha).toBe(0);
  });

  it("preserves the accumulator while paused", () => {
    const clock = new SimClock({ tickHz: 10, maxTicksPerFrame: 4 });
    clock.advance(0);
    clock.advance(50);
    clock.paused = true;

    expect(clock.advance(1050)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.5);
    clock.paused = false;
    expect(clock.advance(1100)).toBe(1);
  });

  it("does not advance while frozen", () => {
    const clock = new SimClock({ tickHz: 10, maxTicksPerFrame: 4 });
    clock.advance(0);
    clock.frozen = true;

    expect(clock.advance(1000)).toBe(0);
    expect(clock.tick).toBe(0);
    clock.frozen = false;
    expect(clock.advance(1100)).toBe(1);
  });
});
