export function readoutCamera(vp: ArrayLike<number>, matrixWorld: ArrayLike<number>) {
  const values = new Float32Array(32);
  values.set(Array.from(vp), 0);
  const axis = (o: number, sign = 1) => {
    const x = matrixWorld[o] * sign,
      y = matrixWorld[o + 1] * sign,
      z = matrixWorld[o + 2] * sign,
      n = Math.hypot(x, y, z);
    return [x / n, y / n, z / n, 0];
  };
  values.set(axis(0), 16);
  values.set(axis(4), 20);
  values.set([matrixWorld[12], matrixWorld[13], matrixWorld[14], 0], 24);
  values.set(axis(8, -1), 28);
  return values;
}
