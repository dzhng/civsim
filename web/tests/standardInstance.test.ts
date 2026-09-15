import { describe, expect, it } from "vitest";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import {
  standardInstanceAppearance,
  type StandardInstance,
} from "../../packages/game-renderer/src/models/shared/standardInstance";
import {
  standardSeed,
  standardWindPhase,
  standardWindStrength,
  standardLiveryForFaction,
} from "../../packages/game-renderer/src/models/shared/standardAsset";
import { PhotorealStandardLayer } from "../../packages/photoreal-renderer/src/landscape/standardLayer";

const base: StandardInstance = { x: 0, y: 0, tier: "battle-unit", factionId: "azure" };
describe("shared standard instances", () => {
  it("preserves legacy campaign defaults and unit-specific battle phases, including explicit zero wind", () => {
    const fallback = standardLiveryForFaction("azure");
    expect(standardInstanceAppearance(base)).toEqual({
      field: fallback.field,
      trim: fallback.trim,
      emblem: fallback.emblem,
      windPhase: standardWindPhase(standardSeed("battle-unit", "azure")),
      windStrength: standardWindStrength("battle-unit"),
    });
    expect(standardInstanceAppearance({ ...base, unitId: 7 }).windPhase).toBe(
      standardWindPhase((standardSeed("battle-unit", "azure") ^ Math.imul(8, 0x9e3779b1)) >>> 0),
    );
    const explicit = standardInstanceAppearance({
      ...base,
      livery: { field: [0.1, 0.8, 0.2], emblem: [0.9, 0.2, 0.7] },
      windPhase: 0,
      windStrength: 0,
    });
    expect(explicit).toEqual({
      field: [0.1, 0.8, 0.2],
      trim: fallback.trim,
      emblem: [0.9, 0.2, 0.7],
      windPhase: 0,
      windStrength: 0,
    });
  });
  it("keeps per-tier livery and pose through growth, shrink and disposal", () => {
    const scene = new THREE.Scene(),
      layer = new PhotorealStandardLayer(scene, uniform(0));
    const city: StandardInstance = {
      ...base,
      tier: "settlement-banner",
      x: 17,
      y: 9,
      z: 3,
      yaw: 0.5,
      scale: 2,
      livery: { field: [0, 1, 0], trim: [1, 0, 0], emblem: [0, 0, 1] },
      windPhase: 0,
      windStrength: 0,
      selected: true,
    };
    layer.upload([base, city]);
    const cityMesh = scene.getObjectByName(
      "settlement-banner-3d-standards",
    ) as THREE.Mesh<THREE.InstancedBufferGeometry>;
    expect(Array.from(cityMesh.geometry.getAttribute("standardPose").array).slice(0, 4)).toEqual([
      17, 9, 3, 0.5,
    ]);
    expect(Array.from(cityMesh.geometry.getAttribute("standardMeta").array).slice(0, 4)).toEqual([
      2, 0, 0, 1,
    ]);
    expect(Array.from(cityMesh.geometry.getAttribute("standardTrim").array).slice(0, 3)).toEqual([
      1, 0, 0,
    ]);
    expect(Array.from(cityMesh.geometry.getAttribute("standardEmblem").array).slice(0, 3)).toEqual([
      0, 0, 1,
    ]);
    const original = cityMesh.geometry;
    let disposed = 0;
    original.addEventListener("dispose", () => disposed++);
    layer.upload([base, ...Array.from({ length: 33 }, (_, i) => ({ ...city, x: i }))]);
    expect(cityMesh.geometry).not.toBe(original);
    expect(disposed).toBe(1);
    const grown = cityMesh.geometry;
    layer.upload([city]);
    expect(cityMesh.geometry).toBe(grown);
    expect(grown.instanceCount).toBe(1);
    expect(scene.getObjectByName("battle-unit-3d-standards")!.visible).toBe(false);
    expect(layer.stats().selected).toBe(1);
    layer.dispose();
    expect(scene.children.length).toBe(0);
  });
});
