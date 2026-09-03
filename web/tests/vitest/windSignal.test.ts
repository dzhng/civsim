// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createWindUniforms,
  sampleBattleWind,
  updateWindUniforms,
  windProfile,
} from "@packages/game-renderer/src/battle/windSignal.ts";

describe("windSignal", () => {
  it("is deterministic for repeated samples and a fixed sweep", () => {
    const a = sampleBattleWind(42.25, -17.5, 9.75);
    const b = sampleBattleWind(42.25, -17.5, 9.75);

    expect(b).toEqual(a);
    expect(hashWindSweep()).toBe("cca0878136ac00e8");
  });

  it("keeps the boundary-layer profile finite and monotonic", () => {
    const heights = [0, 0.015, 0.05, 0.1, 0.35, 0.72, 1.4, 3, 10];
    const samples = heights.map((height) => windProfile(height));

    for (const sample of samples) expect(Number.isFinite(sample)).toBe(true);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    expect(windProfile(10)).toBeCloseTo(1, 4);
  });

  it("keeps speed and gust inside sane bounds over a time sweep", () => {
    for (let t = 0; t <= 180; t += 1.5) {
      for (const [x, y] of SAMPLE_POINTS) {
        const sample = sampleBattleWind(x, y, t);

        expect(Number.isFinite(sample.speed)).toBe(true);
        expect(Number.isFinite(sample.gust)).toBe(true);
        expect(Number.isFinite(sample.dirX)).toBe(true);
        expect(Number.isFinite(sample.dirY)).toBe(true);
        expect(sample.speed).toBeGreaterThanOrEqual(0);
        expect(sample.speed).toBeLessThanOrEqual(24);
        expect(sample.gust).toBeGreaterThanOrEqual(0);
        expect(sample.gust).toBeLessThanOrEqual(3.6);
        expect(Math.hypot(sample.dirX, sample.dirY)).toBeCloseTo(1, 6);
      }
    }
  });

  it("travels gust bands through a fixed point", () => {
    const gusts: number[] = [];
    for (let t = 0; t <= 30; t += 0.5) {
      gusts.push(sampleBattleWind(-220, 40, t).gust);
    }

    const mean = gusts.reduce((sum, value) => sum + value, 0) / gusts.length;
    const variance = gusts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / gusts.length;

    expect(variance).toBeGreaterThan(0.0005);
    expect(Math.max(...gusts) - Math.min(...gusts)).toBeGreaterThan(0.08);
    expect(Math.max(...gusts)).toBeLessThanOrEqual(3.6);
  });

  it("updates the CPU-authored uniform surface from setTime seconds", () => {
    const uniforms = createWindUniforms();

    updateWindUniforms(uniforms, 12.5);

    expect(uniforms.meanDirection.value.x).toBeCloseTo(0.9271838545667879, 12);
    expect(uniforms.meanDirection.value.y).toBeCloseTo(-0.374606593415911, 12);
    expect(uniforms.speed.value).toBe(4.2);
    expect(uniforms.gustPhase.value).toBeCloseTo(64.05, 8);
    expect(uniforms.gustStrength.value).toBe(sampleBattleWind(0, 0, 12.5).gust);
    expect(uniforms.bandVelocity.value.x).toBeCloseTo(4.750890070800221, 12);
    expect(uniforms.bandVelocity.value.y).toBeCloseTo(-1.9194841846631279, 12);
    expect(uniforms.bandFrequency.value).toBeCloseTo(0.09817477042468103, 14);
    expect((Math.PI * 2) / uniforms.bandFrequency.value).toBeCloseTo(64, 12);
    expect(uniforms.bandSharpness.value).toBe(2.7);
  });
});

const SAMPLE_POINTS = [
  [-220, -160],
  [-110, 45],
  [0, 0],
  [80, -35],
  [190, 130],
] as const;

function hashWindSweep(): string {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  let hash = 0xcbf2_9ce4_8422_2325n;
  const times = [0, 5.25, 17.5, 31.75, 64.125, 120.5];
  for (const t of times) {
    for (const [x, y] of SAMPLE_POINTS) {
      const sample = sampleBattleWind(x, y, t);
      for (const value of [sample.speed, sample.gust, sample.dirX, sample.dirY]) {
        view.setFloat64(0, value, true);
        for (const byte of new Uint8Array(buffer)) {
          hash ^= BigInt(byte);
          hash = BigInt.asUintN(64, hash * 0x100_0000_01b3n);
        }
      }
    }
  }
  return hash.toString(16).padStart(16, "0");
}
