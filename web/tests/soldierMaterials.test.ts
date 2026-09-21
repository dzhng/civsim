// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createPlaceholderSoldierMesh,
  createPlaceholderSoldierMeshTiers,
  PLACEHOLDER_MATERIALS,
} from "@packages/soldier-assets/src/soldierMesh.ts";
import {
  encodeSoldierMesh,
  decodeSoldierMesh,
} from "@packages/soldier-assets/src/appearanceBundle.ts";

test("faction identity follows the authored band even when it is not blue", () => {
  const blue = createPlaceholderSoldierMesh([0.2, 0.42, 0.88], 0);
  const brown = createPlaceholderSoldierMesh([0.35, 0.23, 0.13], 0);
  assert.deepEqual(blue.factionMasks, brown.factionMasks);
  const band = [...brown.factionMasks].flatMap((mask, vertex) => (mask === 1 ? [vertex] : []));
  assert.equal(band.length, 24);
  for (const vertex of band) {
    assert.equal(brown.joints[vertex * 4], 4);
    assert.ok(brown.positions[vertex * 3 + 2] >= 1.385 - 1e-6);
    assert.ok(brown.positions[vertex * 3 + 2] <= 1.455 + 1e-6);
  }
});

test("placeholder palette converts sRGB to linear once, preserving alpha", () => {
  const mesh = createPlaceholderSoldierMesh([0.5, 0.02, 1], 0);
  const vertex = mesh.factionMasks.findIndex((mask) => mask === 1);
  assert.ok(Math.abs(mesh.colors[vertex * 4] - 0.21404114048223255) < 1e-7);
  assert.ok(Math.abs(mesh.colors[vertex * 4 + 1] - 0.0015479876160990713) < 1e-9);
  assert.equal(mesh.colors[vertex * 4 + 2], 1);
  assert.equal(mesh.colors[vertex * 4 + 3], 1);
});

test("ordinary blue remains non-faction through the complete mesh transport", () => {
  const mesh = createPlaceholderSoldierMesh([0.35, 0.23, 0.13], 0);
  const ordinary = mesh.factionMasks.findIndex((mask) => mask === 0);
  mesh.colors.set([0.01, 0.02, 0.95, 1], ordinary * 4);
  const loaded = decodeSoldierMesh(encodeSoldierMesh(mesh));
  assert.deepEqual(loaded.colors, mesh.colors);
  assert.deepEqual(loaded.materialIds, mesh.materialIds);
  assert.deepEqual(loaded.factionMasks, mesh.factionMasks);
  assert.equal(loaded.factionMasks[ordinary], 0);
  assert.equal(
    loaded.factionMasks.find((mask) => mask === 1),
    1,
  );
});

test("every roster tier carries declared, triangle-coherent authored surfaces", () => {
  const roster = createPlaceholderSoldierMeshTiers();
  assert.equal(roster.length, 20);
  const used = new Set<string>();
  for (const tiers of roster) {
    for (const [lod, mesh] of tiers.entries()) {
      for (const [vertex, id] of mesh.materialIds.entries()) {
        const material = PLACEHOLDER_MATERIALS[id];
        assert.ok(material, `undeclared material ${id}`);
        used.add(material.name);
        assert.ok(mesh.factionMasks[vertex] === 0 || mesh.factionMasks[vertex] === 1);
        if (mesh.factionMasks[vertex] === 1) assert.equal(material.name, "cloth");
      }
      for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
        const vertices = mesh.indices.subarray(triangle, triangle + 3);
        assert.equal(mesh.materialIds[vertices[0]], mesh.materialIds[vertices[1]]);
        assert.equal(mesh.materialIds[vertices[0]], mesh.materialIds[vertices[2]]);
        assert.equal(mesh.factionMasks[vertices[0]], mesh.factionMasks[vertices[1]]);
        assert.equal(mesh.factionMasks[vertices[0]], mesh.factionMasks[vertices[2]]);
      }
      // Only the far tier drops the arms that carry the faction band.
      assert.equal(mesh.factionMasks.filter((mask) => mask === 1).length, lod === 3 ? 0 : 24);
    }
  }
  assert.deepEqual([...used].sort(), PLACEHOLDER_MATERIALS.map((material) => material.name).sort());
  for (const material of PLACEHOLDER_MATERIALS) {
    assert.deepEqual(material.baseColor, [1, 1, 1, 1]);
    assert.ok(material.roughness > 0 && material.roughness <= 1);
    assert.equal(material.metallic > 0, ["bronze", "iron"].includes(material.name));
  }
});

test("identical brown palette colors can author wood or leather independently", () => {
  const mesh = createPlaceholderSoldierMesh();
  const wood = mesh.materialIds.findIndex((id) => PLACEHOLDER_MATERIALS[id].name === "wood");
  const leather = mesh.materialIds.findIndex((id) => PLACEHOLDER_MATERIALS[id].name === "leather");
  assert.ok(wood >= 0 && leather >= 0);
  assert.deepEqual(
    mesh.colors.subarray(wood * 4, wood * 4 + 4),
    mesh.colors.subarray(leather * 4, leather * 4 + 4),
  );
  assert.notEqual(mesh.materialIds[wood], mesh.materialIds[leather]);
  const woodFactors = PLACEHOLDER_MATERIALS[mesh.materialIds[wood]];
  const leatherFactors = PLACEHOLDER_MATERIALS[mesh.materialIds[leather]];
  assert.notDeepEqual(
    [woodFactors.roughness, woodFactors.metallic],
    [leatherFactors.roughness, leatherFactors.metallic],
  );
});

test("authored scalar factors keep metals smoother than leather and cloth", () => {
  const byName = Object.fromEntries(
    PLACEHOLDER_MATERIALS.map((material) => [material.name, material]),
  );
  assert.ok(byName.iron.metallic > byName.bronze.metallic);
  assert.ok(byName.iron.roughness < byName.bronze.roughness);
  assert.ok(byName.bronze.roughness < byName.leather.roughness);
  assert.ok(byName.leather.roughness < byName.cloth.roughness);
});
