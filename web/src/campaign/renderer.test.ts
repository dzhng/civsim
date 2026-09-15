// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { CampaignRenderer } from "./renderer";

describe("CampaignRenderer stats contract", () => {
  it("retains card, label and timing telemetry before GPU readiness", () => {
    const renderer = Object.assign(Object.create(CampaignRenderer.prototype), {
      canvas: { width: 1280, height: 800 },
      world: null,
      geography: { roadMeshVertices: new Float32Array(), lineVertices: new Float32Array() },
      lastFog: { enabled: false, sources: [] },
      lastEntities: { cityEntities: 0, armyEntities: 0, cityEntityAnchors: [] },
      labelStats: {
        labels: 0,
        visibleLabels: 0,
        visibleLabelNames: [],
        visibleSeaLabelRects: [],
        visibleCityLabelRects: [],
        visibleArmyLabelRects: [],
        visibleFactionLabelRects: [],
        collisionCulls: 0,
        collisionCulledLabels: [],
        atlasWidth: 0,
        atlasHeight: 0,
        vertices: 0,
        layer: "raw-gpu-glyph-atlas",
      },
      lastCards: { rects: [], culls: [] },
      lastLabelComposition: { composedArmyCityLabels: 0 },
      lastFactionView: false,
      graphics: {},
      sceneryCandidates: [],
      mapDrawStats: null,
      framePerf: { buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 },
    }) as CampaignRenderer;

    const stats = renderer.stats();
    expect(stats.ready).toBe(false);
    expect(stats.visibleCardRects).toEqual([]);
    expect(stats.labelCollisionCulledLabels).toEqual([]);
    expect(stats.visibleCityLabelRects).toEqual([]);
    expect(stats.performance).toEqual({ buildMs: 0, uploadMs: 0, drawMs: 0, frameCpuMs: 0 });
  });
});
