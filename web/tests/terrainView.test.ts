import { expect, test } from "vitest";
import {
  terrainViewRequests,
  TERRAIN_DETAIL_LIMIT,
} from "../../packages/photoreal-renderer/src/campaign/terrainView";
const domain = {
  units: "kilometers" as const,
  ox: -2560,
  oy: -1792,
  columns: 305,
  rows: 305,
  cell: 16,
};
const view = { x: -450, y: 1080, zoom: 1.8, width: 1280, height: 800 };
test("overview keeps coarse coverage and nearby moves retain overlapping detail", () => {
  expect(terrainViewRequests({ ...view, zoom: 0.16 }, domain)).toEqual([]);
  const a = terrainViewRequests(view, domain);
  const b = terrainViewRequests({ ...view, x: view.x + 30 }, domain);
  expect(a.length).toBeLessThanOrEqual(TERRAIN_DETAIL_LIMIT);
  expect(b.filter((r) => a.some((p) => p.key === r.key)).length).toBeGreaterThan(a.length * 0.75);
  expect(
    a.some(
      (r) =>
        view.x >= r.minX &&
        view.x <= r.minX + r.size &&
        view.y >= r.minY &&
        view.y <= r.minY + r.size,
    ),
  ).toBe(true);
});
test("distant requests remain inside coverage and return recovers the same identities", () => {
  const first = terrainViewRequests(view, domain);
  const distant = terrainViewRequests({ ...view, x: 1131, y: -686 }, domain);
  expect(distant.every((r) => !first.some((p) => p.key === r.key))).toBe(true);
  expect(terrainViewRequests(view, domain)).toEqual(first);
  for (const r of terrainViewRequests({ ...view, x: -2550, y: -1790 }, domain)) {
    expect(r.minX).toBeGreaterThanOrEqual(domain.ox);
    expect(r.minY).toBeGreaterThanOrEqual(domain.oy);
  }
});
