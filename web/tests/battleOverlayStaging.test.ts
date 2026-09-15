// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { Scene, Mesh, LineSegments } from "three/webgpu";
import {
  PhotorealLineLayer,
  PhotorealTriangleLayer,
  PhotorealRingLayer,
} from "@packages/photoreal-renderer/src/battle/overlayLayer";
import {
  lineStaging,
  triangleStaging,
  ringStaging,
  type OverlayUpload,
} from "../../apps/battle-perf-lab/src/overlayStaging";
import type { BattleLinePlacement } from "@packages/game-renderer/src/battle/overlayData";

function compare(scene: Scene, staged: OverlayUpload, names: string[]) {
  const object = scene.children[0];
  assert.ok(object instanceof Mesh || object instanceof LineSegments);
  assert.equal(object.visible, staged.count > 0);
  if (staged.count)
    for (let i = 0; i < names.length; i++)
      assert.deepEqual(
        Array.from(staged.values[i]),
        Array.from(object.geometry.getAttribute(names[i]).array).slice(0, staged.values[i].length),
      );
}
const expand = (source: Float32Array, n: number) =>
  Float32Array.from({ length: source.length * n }, (_, i) => source[i % source.length]);
test("retained line staging matches actual source draping and explicit-Z precedence through growth/shrink", () => {
  const heightAt = (x: number, y: number) => x * 0.2 - y * 0.1,
    vertices = new Float32Array([1, 2, 0.1, 0.2, 0.3, 0.7, 10, 6, 0.4, 0.5, 0.6, 0.8]);
  const placements: BattleLinePlacement[] = [
    { z: 0.3, drape: { heightAt, step: 2 } },
    { z: 0.4, perVertexZ: true, drape: { heightAt, step: 2 } },
    { z: 0.2 },
  ];
  for (const placement of placements) {
    const scene = new Scene(),
      source = new PhotorealLineLayer(scene, placement.z, {
        ...placement,
        alpha: 0.7,
        depthTest: true,
        renderOrder: 1,
      }),
      stage = lineStaging(placement);
    try {
      let backing: ArrayBuffer | undefined;
      for (const data of [vertices, expand(vertices, 150), vertices, new Float32Array()]) {
        source.upload(data);
        const p = stage(data);
        compare(scene, p, ["position", "lineColor", "lineAlpha"]);
        assert.equal(p.count, source.stats().vertices);
        if (data.length === vertices.length * 150) backing = p.values[0].buffer;
        else if (backing && p.count) assert.equal(p.values[0].buffer, backing);
      }
    } finally {
      source.dispose();
    }
  }
});
test("triangle and ring staging preserve authored colors, seating and active counts through reuse", () => {
  const heightAt = (x: number, y: number) => x * 0.2 - y * 0.1;
  for (const ring of [false, true]) {
    const scene = new Scene(),
      source = ring
        ? new PhotorealRingLayer(scene, heightAt, 0.25)
        : new PhotorealTriangleLayer(scene, 1),
      stage = ring ? ringStaging(heightAt, 0.25) : triangleStaging();
    const data = ring
      ? new Float32Array([3, 5, 2, 0.2, 0.3, 0.4, 0.7])
      : new Float32Array([
          1, 2, 0.2, 0.3, 0.4, 0.7, 3, 4, 0.8, 0.2, 0.1, 0.6, 5, 6, 0.5, 0.4, 0.3, 0.2,
        ]);
    try {
      for (const values of [data, expand(data, 300), data, new Float32Array()]) {
        source.upload(values);
        const p = stage(values);
        compare(scene, p, ring ? ["ringInst", "ringColor"] : ["position", "triColor"]);
        const stats = source.stats();
        assert.equal(p.count, "rings" in stats ? stats.rings : stats.vertices);
      }
    } finally {
      source.dispose();
    }
  }
});
