// @vitest-environment node

import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, test } from "vitest";

import {
  BATTLE_MAP_CATALOG,
  buildBattleTerrainPresentation,
  presentationEdgeMismatches,
} from "@packages/game-renderer/src/battle/mapCatalog.ts";
import { readBattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainGrid.ts";
import { heightSpan, terrainHeightAt } from "@packages/game-renderer/src/terrain/heightField.ts";
import initWasm, { Game } from "../../src/wasm/game_wasm.js";

let wasm: Awaited<ReturnType<typeof initWasm>>;

beforeAll(async () => {
  const module = await readFile(new URL("../../src/wasm/game_wasm_bg.wasm", import.meta.url));
  wasm = await initWasm({ module_or_path: module });
});

describe("battle terrain presentation", () => {
  test.each(BATTLE_MAP_CATALOG)("$id preserves the map catalog invariants", (entry) => {
    const game = new Game(0x5eed_c0de);
    try {
      if (entry.generatedSeed !== undefined) game.load_generated_map(BigInt(entry.generatedSeed));
      else game.load_map(entry.wasmMapId);

      const grid = readBattleTerrainGrid(game, wasm.memory);
      const { w, h, cell, ox, oy } = grid;
      const presentation = buildBattleTerrainPresentation(entry, grid, 0x1234);
      const featureCounts: Record<string, unknown[]> = {};
      for (const feature of presentation.features) {
        (featureCounts[feature.kind] ??= []).push(feature);
      }
      const inBounds = presentation.features.every(
        (feature) =>
          feature.x >= ox &&
          feature.x <= ox + w * cell &&
          feature.y >= oy &&
          feature.y <= oy + h * cell,
      );
      let heightMaxStep = 0;
      let previous: number | undefined;
      for (let y = oy + 20; y < oy + h * cell - 20; y += 4) {
        const height = terrainHeightAt(presentation.height, 0, y);
        if (previous !== undefined)
          heightMaxStep = Math.max(heightMaxStep, Math.abs(height - previous));
        previous = height;
      }
      const sealedEdges = Object.entries(presentation.edges)
        .filter(([, role]) => role !== "open-fog")
        .map(([side, role]) => `${side}:${role}`);
      const span = heightSpan(presentation.height);

      expect(presentation.mapId).toBe(entry.id);
      expect(presentation.groundCover.length).toBeGreaterThan(0);
      expect(cell).toBeGreaterThan(0);
      expect(sealedEdges).toEqual([`west:${entry.edges.west}`, `east:${entry.edges.east}`]);
      expect(presentationEdgeMismatches(entry, grid)).toEqual([]);
      expect(inBounds).toBe(true);
      expect(presentation.features.length).toBeGreaterThan(0);
      expect(featureCounts["micro-rough"]?.length ?? 0).toBeGreaterThan(4);
      if (entry.id === "shore-and-crags") {
        expect(featureCounts.water?.length ?? 0).toBeGreaterThan(0);
      }
      if (entry.id === "wooded-pass") {
        expect(featureCounts.forest?.length ?? 0).toBeGreaterThan(0);
      }
      if (entry.intentionallyFlat) expect(span).toBeLessThan(0.5);
      else expect(span).toBeGreaterThan(1);
      expect(heightMaxStep).toBeLessThan(cell);
    } finally {
      game.free();
    }
  });
});
