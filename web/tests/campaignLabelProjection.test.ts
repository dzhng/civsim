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
      zoom: 2,
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
