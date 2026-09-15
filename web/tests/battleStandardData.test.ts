// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { Scene, Mesh, InstancedBufferGeometry } from "three/webgpu";
import { uniform } from "three/tsl";
import { PhotorealStandardLayer } from "@packages/photoreal-renderer/src/battle/standardLayer";
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
test("native interleaved standards match actual source attributes through growth, shrink and empty", () => {
  const scene = new Scene(),
    source = new PhotorealStandardLayer(scene, uniform(0));
  const records = new BattleStandardRecords();
  try {
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
      source.upload(instances);
      const data = records.write(instances);
      const object = scene.getObjectByName("battle-unit-3d-standards");
      assert.ok(object instanceof Mesh && object.geometry instanceof InstancedBufferGeometry);
      const geometry = object.geometry;
      assert.equal(records.count, source.stats().standards);
      assert.equal(records.selected, source.stats().selected);
      assert.equal(geometry.instanceCount, instances.length);
      assert.equal(data.length, instances.length * 11);
      for (let i = 0; i < instances.length; i++) {
        assert.deepEqual(
          Array.from(data.subarray(i * 11, i * 11 + 4)),
          Array.from(geometry.getAttribute("standardPose").array.slice(i * 4, i * 4 + 4)),
        );
        assert.deepEqual(
          Array.from(data.subarray(i * 11 + 4, i * 11 + 8)),
          Array.from(geometry.getAttribute("standardMeta").array.slice(i * 4, i * 4 + 4)),
        );
        assert.deepEqual(
          Array.from(data.subarray(i * 11 + 8, i * 11 + 11)),
          Array.from(geometry.getAttribute("standardField").array.slice(i * 3, i * 3 + 3)),
        );
      }
    }
  } finally {
    source.dispose();
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
