import type { FrustumPlane } from '../../crowd-runtime/src/visibility';
/** Inward planes for a finite WebGPU reverse-Z view-projection matrix.
 * Ordering matches the production frustum: right, left, bottom, top, far, near. */
export function reverseZFrustumPlanes(m: ArrayLike<number>): FrustumPlane[] {
  const plane = (a: number, b: number, c: number, d: number): FrustumPlane => {
    const inverseLength = 1 / Math.sqrt(a * a + b * b + c * c);
    return {
      normal: { x: a * inverseLength, y: b * inverseLength, z: c * inverseLength },
      constant: d * inverseLength,
    };
  };
  return [
    plane(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]),
    plane(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]),
    plane(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]),
    plane(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]),
    plane(m[2], m[6], m[10], m[14]),
    plane(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]),
  ];
}
