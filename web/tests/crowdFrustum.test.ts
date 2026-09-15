// @vitest-environment node
import { expect, test } from 'vitest';
import { Frustum, Matrix4, WebGPUCoordinateSystem, Vector3 } from 'three';
import { reverseZFrustumPlanes } from '../../apps/battle-perf-lab/src/crowdFrustum';
test('finite reverse-Z perspective and orthographic planes match Three including boundary signs', () => {
  for (const matrix of [
    new Matrix4().makePerspective(-1, 1, 1, -1, 1, 100, WebGPUCoordinateSystem, true),
    new Matrix4().makeOrthographic(-10, 10, 10, -10, 1, 100, WebGPUCoordinateSystem, true),
  ]) {
    const expected = new Frustum().setFromProjectionMatrix(matrix, WebGPUCoordinateSystem, true);
    const planes = reverseZFrustumPlanes(matrix.elements);
    planes.forEach((p, i) =>
      expect([p.normal.x, p.normal.y, p.normal.z, p.constant]).toEqual([
        ...expected.planes[i].normal.toArray(),
        expected.planes[i].constant,
      ]),
    );
    for (const z of [-0.999, -1, -1.001, -99.999, -100, -100.001]) {
      const point = new Vector3(0, 0, z);
      expect(planes.every(p => p.normal.z * z + p.constant >= 0)).toBe(
        expected.containsPoint(point),
      );
    }
  }
});
