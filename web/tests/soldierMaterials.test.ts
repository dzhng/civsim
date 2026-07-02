// Slice 14a seam pin: the photoreal crowd consumes the soldier asset channel
// contract instead of inventing a renderer-local material encoding.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOLDIER_MATERIAL_CHANNELS,
  SOLDIER_MATERIAL_IDENTITY,
  SOLDIER_PBR_VALUES,
  createPlaceholderSoldierMesh,
  soldierMaterialIdentity,
  soldierMaterialMasksFromColor,
} from '../../packages/soldier-assets/src/soldierMesh.ts';

test('soldier material identity publishes the canonical channel order', () => {
  const kit = {
    materials: { channels: ['albedo', 'normal', 'orm', 'factionMask'] },
    archetypes: { 0: { name: 'heavy-sword', material: 'heavy' } },
  } satisfies Parameters<typeof soldierMaterialIdentity>[0];
  const identity = soldierMaterialIdentity(kit);
  assert.equal(identity.identity, SOLDIER_MATERIAL_IDENTITY);
  assert.deepEqual(identity.channels, ['albedo', 'normal', 'orm', 'factionMask']);
  assert.equal(identity.mapping.orm, 'occlusion/roughness/metalness, canonical order from skinnedPipeline');
  assert.equal(identity.mapping.factionMask, SOLDIER_MATERIAL_CHANNELS.factionMask);
  assert.equal(identity.classes['0'].name, 'heavy-sword');
});

test('soldier material masks decode placeholder albedo colors into PBR regions', () => {
  const bronze = soldierMaterialMasksFromColor(0.76, 0.48, 0.18);
  assert.ok(bronze.bronze > 0.8, `bronze mask ${bronze.bronze}`);
  assert.ok(bronze.iron < 0.1, `bronze should not read iron ${bronze.iron}`);

  const iron = soldierMaterialMasksFromColor(0.62, 0.63, 0.62);
  assert.ok(iron.iron > 0.7, `iron mask ${iron.iron}`);
  assert.ok(iron.bronze < 0.1, `iron should not read bronze ${iron.bronze}`);

  const accent = soldierMaterialMasksFromColor(0.20, 0.42, 0.88);
  assert.ok(accent.factionMask > 0.85, `accent mask ${accent.factionMask}`);
});

test('placeholder meshes carry bronze armor, iron blades, and accent masks in cColor', () => {
  const mesh = createPlaceholderSoldierMesh([0.20, 0.42, 0.88], 0);
  let bronzeVerts = 0;
  let ironVerts = 0;
  let accentVerts = 0;
  for (let i = 0; i < mesh.colors.length; i += 4) {
    const masks = soldierMaterialMasksFromColor(mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2]);
    if (masks.bronze > 0.6) bronzeVerts += 1;
    if (masks.iron > 0.6) ironVerts += 1;
    if (masks.factionMask > 0.6) accentVerts += 1;
  }
  assert.ok(bronzeVerts > 0, 'heavy-sword has bronze helmet/metal regions');
  assert.ok(ironVerts > 0, 'heavy-sword has iron blade regions');
  assert.ok(accentVerts > 0, 'heavy-sword has high-blue faction accent regions');
  assert.ok(accentVerts < mesh.colors.length / 4, 'faction mask is localized, not the whole body');
});

test('soldier PBR constants keep metals glossy and cloth/leather rough', () => {
  assert.ok(SOLDIER_PBR_VALUES.metalness.iron > SOLDIER_PBR_VALUES.metalness.bronze);
  assert.ok(SOLDIER_PBR_VALUES.roughness.iron < SOLDIER_PBR_VALUES.roughness.bronze);
  assert.ok(SOLDIER_PBR_VALUES.roughness.bronze < SOLDIER_PBR_VALUES.roughness.leather);
  assert.ok(SOLDIER_PBR_VALUES.roughness.leather < SOLDIER_PBR_VALUES.roughness.linen);
  assert.ok(SOLDIER_PBR_VALUES.accent.maskedMix > 0.9, 'accent mask stays saturated for gameplay zoom');
});
