import { describe, expect, it } from "vitest";
import {
  visibleLabels,
  buildLabelVertices,
} from "@packages/game-renderer/src/campaign/labelLayout";
import type { CampaignLabel } from "@packages/game-renderer/src/campaign/labelFrame";
import { chartCamera3d, projectPoint } from "@packages/renderer-core/src/camera3d";

describe("raised campaign label projection", () => {
  it.each([1, 2])("uses the accepted raised anchor for glyphs at DPR%d", (dpr) => {
    const camera = {
      camera3d: chartCamera3d({ x: 0, y: 0, zoom: 2 }, 800),
      x: 0,
      y: 0,
      zoom: 2 * dpr,
      width: 1280 * dpr,
      height: 800 * dpr,
    };
    camera.camera3d.aspect = 1280 / 800;
    const label: CampaignLabel = {
      text: "Raised city",
      x: 10,
      y: 20,
      kind: "city",
      priority: 3,
      size: 15,
    };
    const point = projectPoint(camera.camera3d, [label.x, label.y, 40]);
    const projected: [number, number] = [
      ((point.ndc[0] + 1) * camera.width) / 2,
      ((1 - point.ndc[1]) * camera.height) / 2,
    ];
    const visible = visibleLabels([label], camera, dpr, () => projected);
    expect(visible).toHaveLength(1);
    expect([visible[0].screenX, visible[0].screenY]).toEqual(projected);
    const entries = [
      {
        ...visible[0],
        width: 100 * dpr,
        height: 20 * dpr,
        padding: 2 * dpr,
        inkInset: 0.5 * dpr,
        u0: 0,
        v0: 0,
        u1: 1,
        v1: 1,
      },
    ];
    const vertices = buildLabelVertices(entries, true);
    expect(vertices[0]).toBeCloseTo(projected[0], 3);
    expect(vertices[1]).toBeCloseTo(projected[1], 3);
    expect(vertices[0] + vertices[2]).toBeCloseTo(projected[0] - 50 * dpr, 3);
    expect(visibleLabels([label], camera, dpr, () => null)).toEqual([]);
  });
});

describe("campaign label CSS zoom policy", () => {
  it.each([0.3, 0.4, 0.59, 0.6, 0.84, 0.85, 0.96, 2.5])(
    "preserves label choices, CSS size and opacity at zoom %s across DPR",
    (zoom) => {
      const labels: CampaignLabel[] = [
        ...[1, 2, 3].map(
          (priority): CampaignLabel => ({
            text: `City ${priority}`,
            kind: "city",
            priority,
            x: 0,
            y: 0,
            size: 12,
          }),
        ),
        { text: "Army", kind: "army", priority: 4, x: 0, y: 0, size: 12 },
        { text: "Sea", kind: "sea", priority: 1, x: 0, y: 0, size: 20 },
        { text: "Major", kind: "faction", priority: 1, x: 0, y: 0, size: 20, factionRadiusKm: 120 },
        {
          text: "League",
          kind: "faction",
          priority: 1,
          x: 0,
          y: 0,
          size: 20,
          factionRadiusKm: 60,
          factionMinor: true,
          importance: 10,
        },
      ];
      const render = (dpr: number) =>
        visibleLabels(
          labels,
          {
            camera3d: chartCamera3d({ x: 0, y: 0, zoom }, 800),
            x: 0,
            y: 0,
            zoom: zoom * dpr,
            width: 1280 * dpr,
            height: 800 * dpr,
          },
          dpr,
        ).map(({ label, opacity, screenX, screenY }) => ({
          text: label.text,
          size: label.size,
          opacity,
          x: screenX / dpr,
          y: screenY / dpr,
        }));
      const standard = render(1);
      expect(standard.some((label) => label.text === "City 3")).toBe(true);
      expect(render(2)).toEqual(standard);
    },
  );
});

it.each([1, 2])("keeps the same CSS label overscan at DPR%s", (dpr) => {
  const labels: CampaignLabel[] = [
    { text: "Near edge", kind: "city", priority: 3, x: 0, y: 0, size: 12 },
    { text: "Outside", kind: "city", priority: 3, x: 0, y: 0, size: 12 },
  ];
  const camera = {
    camera3d: chartCamera3d({ x: 0, y: 0, zoom: 1 }, 800),
    x: 0,
    y: 0,
    zoom: dpr,
    width: 1280 * dpr,
    height: 800 * dpr,
  };
  expect(
    visibleLabels(labels, camera, dpr, (label) => [
      (label.text === "Near edge" ? -150 : -190) * dpr,
      400 * dpr,
    ]).map(({ label }) => label.text),
  ).toEqual(["Near edge"]);
});
