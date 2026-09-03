// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { turfTelemetry } from "../scenes/battle/turf-telemetry-lib.js";

function image(width: number, height: number, pixel: (x: number, y: number) => number[]) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

test("flat turf has exact mean and no luminance structure", () => {
  const telemetry = turfTelemetry(image(32, 24, () => [64, 128, 32, 255]));
  const expectedMean =
    0.2126 * linearize(64 / 255) + 0.7152 * linearize(128 / 255) + 0.0722 * linearize(32 / 255);
  assert.equal(telemetry.sampleCount, 768);
  assert.ok(Math.abs(telemetry.meanLuma - expectedMean) < 1e-12);
  assert.ok(telemetry.lumaSpanP90P10 < 1e-12);
  assert.ok(telemetry.midBandRms < 1e-12);
  assert.ok(telemetry.oklab.hueSpreadDeg < 1e-5);
  assert.ok(telemetry.oklab.chromaSpread < 1e-12);
});

test("mid-scale checker registers luminance span and bandpass energy", () => {
  const telemetry = turfTelemetry(
    image(64, 64, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? [150, 170, 100, 255] : [55, 75, 30, 255])),
  );
  assert.ok(telemetry.lumaSpanP90P10 > 0.3);
  assert.ok(telemetry.midBandRms > 0.035);
});

test("value-only variation holds OKLab hue while warm variation moves it", () => {
  const base = turfTelemetry(image(24, 24, () => [80, 120, 45, 255]));
  const value = turfTelemetry(
    image(24, 24, (x) => (x < 12 ? [64, 96, 36, 255] : [96, 144, 54, 255])),
  );
  const warm = turfTelemetry(image(24, 24, () => [110, 112, 42, 255]));
  assert.ok(circularDistance(base.oklab.meanHueDeg, value.oklab.meanHueDeg) < 1);
  assert.ok(circularDistance(base.oklab.meanHueDeg, warm.oklab.meanHueDeg) > 5);
});

test("telemetry is deterministic", () => {
  const input = image(37, 29, (x, y) => [x * 3, 80 + (y % 9), 30 + ((x + y) % 20), 255]);
  assert.deepEqual(turfTelemetry(input), turfTelemetry(input));
});

test("near-neutral pixels do not invent hue spread", () => {
  const telemetry = turfTelemetry(
    image(32, 32, (x) => (x % 2 ? [128, 128, 128, 255] : [129, 128, 128, 255])),
  );
  assert.ok(telemetry.oklab.meanChroma < 0.001);
  assert.ok(telemetry.oklab.hueSpreadDeg < 1);
});

function circularDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function linearize(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
