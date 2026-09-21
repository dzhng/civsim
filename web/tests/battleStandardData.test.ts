// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { standardLiveryForFaction } from "@packages/game-renderer/src/models/shared/standardAsset";
import {
  BattleStandardRecords,
  type BattleStandardInstance,
} from "@packages/game-renderer/src/models/shared/battleStandardData";

const banner: BattleStandardInstance = {
  unitId: 31,
  x: 3.25,
  y: -2,
  z: 4,
  yaw: 0.7,
  scale: 3,
  factionId: "crimson",
  selected: true,
};
test("interleaved standards retain pose, color, selection and active count through growth and shrink", () => {
  const records = new BattleStandardRecords();
  for (const instances of [
    [banner],
    Array.from({ length: 40 }, (_, i) => ({
      ...banner,
      unitId: i,
      x: i * 0.3,
      selected: i % 2 === 0,
    })),
    [{ ...banner, selected: false }],
    [],
  ]) {
    const data = records.write(instances);
    assert.equal(records.count, instances.length);
    assert.equal(records.selected, instances.filter((instance) => instance.selected).length);
    assert.equal(data.length, instances.length * 11);
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      assert.deepEqual(
        Array.from(data.subarray(i * 11, i * 11 + 5)),
        Array.from(
          new Float32Array([instance.x, instance.y, instance.z, instance.yaw, instance.scale]),
        ),
      );
      assert.equal(data[i * 11 + 7], +instance.selected);
      assert.deepEqual(
        Array.from(data.subarray(i * 11 + 8, i * 11 + 11)),
        Array.from(new Float32Array(standardLiveryForFaction(instance.factionId).field)),
      );
    }
  }
});
test("selection and reordering keep a unit's wave phase and caller legibility scale", () => {
  const records = new BattleStandardRecords();
  const first = records.write([banner]).slice();
  const backing = records.data;
  const reordered = records.write([
    { ...banner, unitId: 32 },
    { ...banner, selected: false },
  ]);
  assert.equal(records.data, backing);
  assert.equal(reordered[11 + 4], banner.scale);
  assert.equal(reordered[11 + 5], first[5]);
  assert.notEqual(reordered[5], first[5]);
  assert.equal(reordered[11 + 7], 0);
  records.write([]);
  assert.equal(records.data, backing);
  assert.equal(records.count, 0);
});
