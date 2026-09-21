/** Convert categorical source tints before any geometric or fragment interpolation.
 * Channels are rock, forest and scree; mud/roads remain owned by earth distance. */
export function groundCoverage(tints: Float32Array): Float32Array {
  const coverage = new Float32Array(tints.length * 3);
  for (let i = 0; i < tints.length; i++) {
    coverage[i * 3] = tints[i] === 2 ? 1 : 0;
    coverage[i * 3 + 1] = tints[i] === 4 ? 1 : 0;
    coverage[i * 3 + 2] = tints[i] === 6 ? 1 : 0;
  }
  return coverage;
}
