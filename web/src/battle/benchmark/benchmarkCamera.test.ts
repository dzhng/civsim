// @vitest-environment node
import { expect, it } from "vitest";
import { eyePosition } from "@packages/renderer-core/src/camera3d";
import { Camera } from "../../shared/camera";
import { applyBenchmarkCamera, sampleBenchmarkCamera } from "./benchmarkCamera";

function camera() {
  const result = new Camera({ width: 1440, height: 900 } as HTMLCanvasElement);
  result.setRig({ min: 0.4, max: 60 }, { width: 2400, height: 1600 });
  result.bounds = [-1200, -800, 1200, 800];
  return result;
}

it("reaches the same physical framing after skipped frames or arbitrary prior look", () => {
  const stepped = camera();
  for (let time = 0; time <= 165_000; time += 1000) applyBenchmarkCamera(stepped, time);
  const direct = camera();
  direct.pitchBias = 100;
  direct.yaw = 2.4;
  direct.setViewCenter(-400, 300);
  const intended = applyBenchmarkCamera(direct, 165_000);
  expect(intended).toEqual(sampleBenchmarkCamera(165_000));
  for (const subject of [direct, stepped]) {
    const actual = subject.params();
    expect(actual.target.slice(0, 2)).toEqual(intended.center);
    expect(actual.distance).toBeCloseTo(intended.distance, 2);
    expect(actual.pitch).toBeCloseTo(intended.pitch, 9);
    expect(actual.yaw).toBeCloseTo(intended.yaw, 9);
    applyBenchmarkCamera(subject, 165_000);
    expect(subject.params().pitch).toBeCloseTo(intended.pitch, 9);
  }
});

it("crosses phases without pose or velocity jumps and traverses close, wide and horizon views", () => {
  const values = (time: number) => {
    const pose = sampleBenchmarkCamera(time);
    return [...pose.center, pose.distance, pose.yaw, pose.pitch];
  };
  for (const boundary of [30_000, 90_000, 150_000, 210_000, 270_000]) {
    const before = values(boundary - 1);
    const at = values(boundary);
    const after = values(boundary + 1);
    for (let i = 0; i < at.length; i++) {
      expect(Math.abs(after[i] - before[i])).toBeLessThan(0.001);
      expect(Math.abs(after[i] - at[i] - (at[i] - before[i]))).toBeLessThan(0.001);
    }
  }
  expect(sampleBenchmarkCamera(60_000).center[0]).toBeLessThan(
    sampleBenchmarkCamera(30_000).center[0],
  );
  expect(sampleBenchmarkCamera(90_000).center[0]).toBeGreaterThan(
    sampleBenchmarkCamera(60_000).center[0],
  );
  const subject = camera();
  for (const time of [100_000, 120_000, 140_000, 180_000]) {
    const intended = applyBenchmarkCamera(subject, time);
    expect(subject.params().distance).toBeCloseTo(intended.distance, 2);
  }
  expect(sampleBenchmarkCamera(100_000).distance).toBeLessThan(60);
  expect(sampleBenchmarkCamera(120_000).distance).toBeGreaterThan(800);
  expect(sampleBenchmarkCamera(180_000).pitch).toBeLessThan(0.2);
  expect(sampleBenchmarkCamera(-100)).toEqual(sampleBenchmarkCamera(0));
  expect(sampleBenchmarkCamera(310_000)).toEqual(sampleBenchmarkCamera(300_000));
});

it("lets production terrain clearance lift a horizon view without changing tour framing", () => {
  const subject = camera();
  subject.groundSurface = {
    heightAt: (_x, y) => (y < -250 ? 100 : 0),
    raycast: () => null,
  };
  const intended = applyBenchmarkCamera(subject, 165_000);
  const actual = subject.params();
  const eye = eyePosition(actual);
  expect(actual.target[2]).toBeGreaterThan(0);
  expect(eye[2]).toBeGreaterThan(subject.groundSurface.heightAt(eye[0], eye[1]));
  expect(actual.target.slice(0, 2)).toEqual(intended.center);
  expect(actual.pitch).toBeCloseTo(intended.pitch, 9);
});
