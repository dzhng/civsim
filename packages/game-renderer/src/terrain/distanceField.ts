/** Two-pass chamfer distance over a rectangular binary raster, in world units. */
export function distanceTo(
  mask: Uint8Array,
  width: number,
  height: number,
  target: number,
  cell: number,
): Float32Array {
  const distance = Float32Array.from(mask, (value) =>
    value === target ? 0 : (width + height) * cell,
  );
  const diagonal = cell * Math.SQRT2;
  for (const direction of [1, -1]) {
    for (let row = 0; row < height; row++) {
      const y = direction === 1 ? row : height - 1 - row,
        previousY = y - direction;
      for (let column = 0; column < width; column++) {
        const x = direction === 1 ? column : width - 1 - column,
          k = y * width + x;
        const previousX = x - direction,
          nextX = x + direction;
        let value = distance[k];
        if (previousX >= 0 && previousX < width)
          value = Math.min(value, distance[y * width + previousX] + cell);
        if (previousY >= 0 && previousY < height) {
          const previousRow = previousY * width;
          value = Math.min(value, distance[previousRow + x] + cell);
          if (previousX >= 0 && previousX < width)
            value = Math.min(value, distance[previousRow + previousX] + diagonal);
          if (nextX >= 0 && nextX < width)
            value = Math.min(value, distance[previousRow + nextX] + diagonal);
        }
        distance[k] = value;
      }
    }
  }
  return distance;
}
