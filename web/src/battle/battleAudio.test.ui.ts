import { describe, expect, it } from "vitest";
import {
  nearestWaterSurfaceSignal,
  sampleGrassNear,
  type BattleAudioWaterSurface,
} from "./battleAudio";

describe("battleAudio helpers", () => {
  it("keeps landlocked maps silent for water", () => {
    expect(nearestWaterSurfaceSignal([0, 0], [1, 0], [])).toEqual({
      proximity: 0,
      pan: 0,
      distance: Infinity,
    });
  });

  it("uses the nearest water surface and pans toward its screen side", () => {
    const surfaces: BattleAudioWaterSurface[] = [
      { kind: "lake", x0: -260, y0: -30, x1: -220, y1: 30 },
      { kind: "lake", x0: 100, y0: -40, x1: 140, y1: 40 },
    ];

    const signal = nearestWaterSurfaceSignal([0, 0], [1, 0], surfaces);

    expect(signal.distance).toBe(100);
    expect(signal.proximity).toBeGreaterThan(0.25);
    expect(signal.pan).toBeGreaterThan(0);
  });

  it("fades ocean proximity across a wider shore band", () => {
    const surfaces: BattleAudioWaterSurface[] = [
      { kind: "ocean", x0: -2600, y0: -400, x1: 12, y1: 400 },
    ];

    const near = nearestWaterSurfaceSignal([80, 0], [-1, 0], surfaces);
    const far = nearestWaterSurfaceSignal([700, 0], [-1, 0], surfaces);

    expect(near.proximity).toBeGreaterThan(far.proximity);
    expect(far.proximity).toBeGreaterThan(0);
    expect(near.pan).toBeGreaterThan(0);
  });

  it("samples nearby grass from terrain tint without reading renderer state", () => {
    const tint = new Uint8Array([0, 0, 1, 4, 6, 2, 0, 5, 0]);

    expect(
      sampleGrassNear([15, 15], {
        w: 3,
        h: 3,
        cell: 10,
        ox: 0,
        oy: 0,
        tint,
        groundCover: "green-grass",
      }),
    ).toBeCloseTo((1 + 1 + 0 + 0.4 + 0.16 + 0 + 1 + 0 + 1) / 9, 5);
  });
});
