import assert from "node:assert/strict";
export function compare(a, b) {
  assert.ok(a.width === b.width && a.height === b.height, "Image sizes differ");
  let max = 0,
    total = 0,
    mismatched = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let delta = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i + c] - b.data[i + c]);
      max = Math.max(max, d);
      total += d;
      delta = Math.max(delta, d);
    }
    if (delta > 2) mismatched++;
  }
  return {
    maxChannelDelta: max,
    meanChannelDelta: total / (a.width * a.height * 3),
    mismatchRatioAbove2: mismatched / (a.width * a.height),
  };
}
