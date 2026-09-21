// @vitest-environment node
import { expect, test } from "vitest";
import {
  lineStaging,
  triangleStaging,
  ringStaging,
} from "@packages/battle-renderer/src/overlayStaging";

const expand = (source: Float32Array, n: number) =>
  Float32Array.from({ length: source.length * n }, (_, i) => source[i % source.length]);

test("retained line staging drapes terrain and gives explicit Z precedence through growth and shrink", () => {
  const heightAt = (x: number, y: number) => x * 0.2 - y * 0.1;
  const vertices = new Float32Array([1, 2, 0.1, 0.2, 0.3, 0.7, 10, 6, 0.4, 0.5, 0.6, 0.8]);
  for (const perVertexZ of [false, true]) {
    const stage = lineStaging({ z: 0.3, perVertexZ, drape: { heightAt, step: 2 } });
    let backing: ArrayBufferLike | undefined;
    for (const copies of [1, 150, 1, 0]) {
      const data = stage(expand(vertices, copies));
      expect(data.count).toBe(copies * (perVertexZ ? 2 : 10));
      if (!data.count) {
        expect(data.values).toEqual([]);
        continue;
      }
      if (backing) expect(data.values[0].buffer).toBe(backing);
      if (copies === 150) backing = data.values[0].buffer;
      const [positions, colors, alpha] = data.values;
      for (let i = 0; i < data.count; i++) {
        const [x, y, z] = positions.subarray(i * 3, i * 3 + 3);
        expect(z).toBeCloseTo((perVertexZ ? (i % 2 ? 0.4 : 0.1) : heightAt(x, y)) + 0.3, 5);
        expect(alpha[i]).toBeCloseTo(perVertexZ ? 1 : i % 2 ? 0.8 : 0.7);
      }
      expect(Array.from(colors.slice(0, 3))).toEqual(
        Array.from(new Float32Array(perVertexZ ? [0.2, 0.3, 0.7] : [0.1, 0.2, 0.3])),
      );
    }
  }
  const flat = lineStaging({ z: 0.2 })(vertices);
  expect(Array.from(flat.values[0])).toEqual(Array.from(new Float32Array([1, 2, 0.2, 10, 6, 0.2])));
});

test("triangle and ring staging preserve authored colors, seating and active counts through reuse", () => {
  const cases = [
    {
      stage: triangleStaging(),
      input: new Float32Array([1, 2, 0.2, 0.3, 0.4, 0.7]),
      position: [1, 2, 0],
      color: [0.2, 0.3, 0.4, 0.7],
    },
    {
      stage: ringStaging((x, y) => x * 0.2 - y * 0.1, 0.25),
      input: new Float32Array([3, 5, 2, 0.2, 0.3, 0.4, 0.7]),
      position: [3, 5, 0.35, 2],
      color: [0.2, 0.3, 0.4, 0.7],
    },
  ];
  for (const { stage, input, position, color } of cases) {
    let backing: ArrayBufferLike | undefined;
    for (const count of [1, 300, 1, 0]) {
      const data = stage(expand(input, count));
      expect(data.count).toBe(count);
      if (!count) {
        expect(data.values).toEqual([]);
        continue;
      }
      expect(Array.from(data.values[0])).toEqual(
        Array.from(expand(new Float32Array(position), count)),
      );
      expect(Array.from(data.values[1])).toEqual(
        Array.from(expand(new Float32Array(color), count)),
      );
      if (backing) expect(data.values[0].buffer).toBe(backing);
      if (count === 300) backing = data.values[0].buffer;
    }
  }
});
