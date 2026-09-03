// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  MEADOW,
  meadowFamily,
  type Rgb,
} from "@packages/game-renderer/src/battle/meadowPalette.ts";

test("every meadow color role is a finite normalized RGB triplet", () => {
  const roles = rgbRoles(MEADOW);
  assert.ok(Object.keys(roles).length > 0);
  for (const [role, color] of Object.entries(roles)) {
    assert.ok(
      color.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1),
      `${role} leaves normalized RGB`,
    );
  }
});

test("every meadow color role follows a changed base", () => {
  const changed = rgbRoles(meadowFamily([0.5, 0.44, 0.33]));
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
