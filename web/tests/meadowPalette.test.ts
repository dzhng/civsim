import assert from "node:assert/strict";
import test from "node:test";
import {
  GROUND_COVER_COLOR,
  MEADOW,
  meadowFamily,
  type Rgb,
} from "../../packages/game-renderer/src/battle/meadowPalette.ts";

const EXPECTED_ROLES: Readonly<Record<string, Rgb>> = {
  base: [0.4, 0.49, 0.26],
  "blade.root": [0.46, 0.52, 0.25],
  "blade.mid": [0.58, 0.61, 0.32],
  "blade.tip": [0.71, 0.71, 0.42],
  "blade.ringMeadow": [0.47, 0.53, 0.32],
  "farGrass.low": [0.36, 0.42, 0.22],
  "farGrass.high": [0.62, 0.63, 0.4],
  "farGrass.shadow": [0.28, 0.33, 0.17],
  "farGrass.lift": [0.72, 0.72, 0.47],
  "quad.default.oliveLow": [0.43, 0.56, 0.22],
  "quad.default.oliveHigh": [0.66, 0.69, 0.33],
  "quad.default.dry": [0.76, 0.67, 0.39],
  "quad.default.stubble": [0.53, 0.48, 0.25],
  "quad.default.darkFleck": [0.47, 0.43, 0.32],
  "quad.wideDetail.oliveLow": [0.44, 0.58, 0.22],
  "quad.wideDetail.oliveHigh": [0.68, 0.71, 0.33],
  "quad.wideDetail.dry": [0.75, 0.67, 0.39],
  "quad.wideDetail.stubble": [0.52, 0.47, 0.25],
  "quad.wideDetail.darkFleck": [0.45, 0.42, 0.31],
  "quad.scrub": [0.31, 0.39, 0.18],
  "quad.rakedDust": [0.88, 0.75, 0.47],
  "quad.lightFleck": [0.13, 0.12, 0.055],
  "quad.stoneFleck": [0.46, 0.43, 0.32],
  "quad.sunBleached": [0.86, 0.72, 0.46],
  "quad.backdrop.low": [0.16, 0.25, 0.12],
  "quad.backdrop.high": [0.3, 0.42, 0.2],
  "quad.backdrop.shadow": [0.11, 0.18, 0.1],
  "quad.backdrop.fleck": [0.1, 0.12, 0.04],
  "earth.forestFloor": [0.24, 0.34, 0.19],
  "earth.mud": [0.4, 0.33, 0.23],
  "earth.roadDust": [0.56, 0.53, 0.45],
};

test("meadow palette reproduces every pre-refactor color", () => {
  const actual = rgbRoles(MEADOW);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(EXPECTED_ROLES).sort());
  for (const [role, expected] of Object.entries(EXPECTED_ROLES)) {
    assertRgbClose(actual[role], expected, role);
  }
  assert.equal(MEADOW.blade.dryTipMix, 0.05);
  assert.deepEqual(GROUND_COVER_COLOR, {
    "green-grass": [0.4, 0.49, 0.26],
    "yellow-grass": [0.6, 0.57, 0.31],
    "scrub-grass": [0.52, 0.53, 0.34],
    sand: [0.74, 0.66, 0.46],
  });
});

test("every meadow color role follows a changed base", () => {
  const changed = rgbRoles(meadowFamily([0.42, 0.5, 0.28]));
  const original = rgbRoles(MEADOW);
  assert.deepEqual(Object.keys(changed).sort(), Object.keys(original).sort());
  for (const role of Object.keys(original)) {
    assert.ok(
      changed[role].every((channel, index) => channel !== original[role][index]),
      `${role} retained an independently pinned channel`,
    );
  }
});

function rgbRoles(value: unknown, prefix = "", out: Record<string, Rgb> = {}): Record<string, Rgb> {
  if (isRgb(value)) {
    out[prefix] = value;
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    rgbRoles(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function isRgb(value: unknown): value is Rgb {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((channel) => typeof channel === "number")
  );
}

function assertRgbClose(actual: Rgb | undefined, expected: Rgb, role: string): void {
  assert.ok(actual, `missing ${role}`);
  for (let channel = 0; channel < 3; channel++) {
    assert.ok(
      Math.abs(actual[channel] - expected[channel]) <= 1e-6,
      `${role}[${channel}] expected ${expected[channel]}, got ${actual[channel]}`,
    );
  }
}
