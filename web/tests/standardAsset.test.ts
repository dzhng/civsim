// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  BATTLE_FACTIONS,
  type BattleFaction,
} from "@packages/game-renderer/src/battle/factionColors.ts";
import {
  STANDARD_CLOTH_MATERIAL,
  STANDARD_EMBLEM_MATERIAL,
  STANDARD_SIZE_TIER_IDS,
  STANDARD_TRIM_MATERIAL,
  STANDARD_VERTEX_STRIDE_FLOATS,
  buildStandardMesh,
  standardLiveryForFaction,
  standardSeed,
  standardWaveDisplacement,
  standardWindPhase,
  standardWindStrength,
  type StandardMaterialId,
  type StandardSizeTier,
} from "@packages/game-renderer/src/models/shared/standardAsset.ts";

test("standard asset publishes the three required size tiers", () => {
  assert.deepEqual(STANDARD_SIZE_TIER_IDS, ["battle-unit", "campaign-army", "settlement-banner"]);
});

test("standard mesh carries moving cloth and rigid hardware weights", () => {
  for (const tier of STANDARD_SIZE_TIER_IDS) {
    const mesh = buildStandardMesh(tier);
    assert.equal(mesh.opaque.strideFloats, STANDARD_VERTEX_STRIDE_FLOATS);
    assert.ok(mesh.opaque.indexCount > 300, `${tier} should be real geometry`);
    const weights = weightsByMaterial(mesh.opaque.vertices);
    const cloth = weights.get(STANDARD_CLOTH_MATERIAL);
    const trim = weights.get(STANDARD_TRIM_MATERIAL);
    assert.ok((cloth?.max ?? 0) > 0.75, `${tier} cloth swings at the swallowtail`);
    assert.ok((cloth?.min ?? 1) < 0.05, `${tier} cloth is sewn at the crossbar`);
    // Trim and emblem sample the same wave field as the cloth under them —
    // a rigid border on a billowing cloth reads as detached.
    assert.ok((trim?.max ?? 0) > 0.6, `${tier} trim rides the cloth`);
    assert.ok((trim?.min ?? 1) < 0.05, `${tier} top trim is sewn like the cloth top`);
    assert.ok(
      (weights.get(STANDARD_EMBLEM_MATERIAL)?.max ?? 0) > 0.25,
      `${tier} emblem rides cloth`,
    );
    assert.equal(weights.get(0)?.max ?? 0, 0, `${tier} pole stays rigid`);
    assert.equal(weights.get(1)?.max ?? 0, 0, `${tier} finial/crossbar stays rigid`);
  }
});

test("standard wave uses explicit time and deterministic hashed phase", () => {
  const tier: StandardSizeTier = "campaign-army";
  const phase = standardWindPhase(standardSeed(tier, "azure"));
  const strength = standardWindStrength(tier);
  const local: [number, number, number] = [0.7, 0, 2.6];
  const a = standardWaveDisplacement({ local, weight: 0.8, timeSeconds: 1.25, phase, strength });
  const b = standardWaveDisplacement({ local, weight: 0.8, timeSeconds: 1.25, phase, strength });
  const c = standardWaveDisplacement({ local, weight: 0.8, timeSeconds: 1.75, phase, strength });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(
    standardWaveDisplacement({ local, weight: 0, timeSeconds: 1.75, phase, strength }),
    0,
  );
});

test("standard wave back lobe cannot reach the pole", () => {
  // The cloth hangs poleRadius+0.03 in front of the pole and only the center
  // column (u=0.5, where the builder's edge factor bottoms out at 0.62) can
  // touch it; the toward-pole lobe is capped so no phase/time pushes through.
  const centerColumnMaxWeight = 0.62;
  for (const tier of STANDARD_SIZE_TIER_IDS) {
    const strength = standardWindStrength(tier);
    for (const factionId of ["azure", "crimson"] as const) {
      const phase = standardWindPhase(standardSeed(tier, factionId));
      for (let step = 0; step < 200; step++) {
        const displacement = standardWaveDisplacement({
          local: [0, 0, 1.8],
          weight: centerColumnMaxWeight,
          timeSeconds: step * 0.037,
          phase,
          strength,
        });
        assert.ok(displacement < 0.03, `${tier}/${factionId} pierces at step ${step}`);
      }
    }
  }
});

test("standard livery derives field and gold trim from the faction table", () => {
  const azure = standardLiveryForFaction("azure");
  const crimson = standardLiveryForFaction("crimson");
  assert.deepEqual(azure.field, bannerRgb(BATTLE_FACTIONS[0]));
  assert.deepEqual(crimson.field, bannerRgb(BATTLE_FACTIONS[1]));
  assert.deepEqual(azure.trim, BATTLE_FACTIONS[2].primary);
  assert.deepEqual(crimson.trim, BATTLE_FACTIONS[2].primary);
  assert.deepEqual(azure.emblem, BATTLE_FACTIONS[2].primary);
});

function weightsByMaterial(vertices: Float32Array) {
  const weights = new Map<StandardMaterialId, { min: number; max: number }>();
  for (let i = 0; i < vertices.length; i += STANDARD_VERTEX_STRIDE_FLOATS) {
    const weight = vertices[i + 8];
    const material = Math.round(vertices[i + 9]) as StandardMaterialId;
    const current = weights.get(material) ?? { min: Infinity, max: -Infinity };
    current.min = Math.min(current.min, weight);
    current.max = Math.max(current.max, weight);
    weights.set(material, current);
  }
  return weights;
}

function bannerRgb(faction: BattleFaction): readonly [number, number, number] {
  const hex = faction.bannerCss.slice(1);
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}
