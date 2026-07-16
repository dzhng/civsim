/** Pure linear-sRGB turf telemetry. Accepts a pngjs-compatible RGBA image. */
export function turfTelemetry(image) {
  if (!image || image.width < 1 || image.height < 1 || image.data.length < 4) {
    throw new Error("turfTelemetry requires a non-empty RGBA image");
  }
  const count = image.width * image.height;
  const luma = new Float64Array(count);
  let lumaSum = 0;
  let aSum = 0;
  let bSum = 0;
  let chromaSum = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    const r = image.data[p] / 255;
    const g = image.data[p + 1] / 255;
    const b = image.data[p + 2] / 255;
    const lr = linearize(r);
    const lg = linearize(g);
    const lb = linearize(b);
    const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    luma[i] = y;
    lumaSum += y;
    const lab = srgbToOklab(r, g, b);
    aSum += lab.a;
    bSum += lab.b;
    chromaSum += Math.hypot(lab.a, lab.b);
  }

  const meanA = aSum / count;
  const meanB = bSum / count;
  const meanHueDeg = wrapDegrees((Math.atan2(meanB, meanA) * 180) / Math.PI);
  const meanChroma = chromaSum / count;
  let chromaVariance = 0;
  let hueVectorX = 0;
  let hueVectorY = 0;
  let hueWeight = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    const lab = srgbToOklab(image.data[p] / 255, image.data[p + 1] / 255, image.data[p + 2] / 255);
    const chroma = Math.hypot(lab.a, lab.b);
    chromaVariance += (chroma - meanChroma) ** 2;
    if (chroma > 1e-6) {
      hueVectorX += Math.cos(Math.atan2(lab.b, lab.a)) * chroma;
      hueVectorY += Math.sin(Math.atan2(lab.b, lab.a)) * chroma;
      hueWeight += chroma;
    }
  }
  const resultant = hueWeight > 0 ? Math.hypot(hueVectorX, hueVectorY) / hueWeight : 1;
  const hueSpreadDeg =
    resultant > 0 ? (Math.sqrt(-2 * Math.log(Math.min(1, resultant))) * 180) / Math.PI : 180;
  const sorted = Float64Array.from(luma).sort();
  const p10 = percentile(sorted, 0.1);
  const p90 = percentile(sorted, 0.9);

  return {
    sampleCount: count,
    meanLuma: lumaSum / count,
    lumaP10: p10,
    lumaP90: p90,
    lumaSpanP90P10: p90 - p10,
    midBandRms: bandpassRms(luma, image.width, image.height, 2, 12),
    oklab: {
      meanHueDeg,
      meanChroma,
      hueSpreadDeg,
      chromaSpread: Math.sqrt(chromaVariance / count),
    },
  };
}

function bandpassRms(values, width, height, innerRadius, outerRadius) {
  const inner = boxBlur(values, width, height, innerRadius);
  const outer = boxBlur(values, width, height, outerRadius);
  let sumSquares = 0;
  for (let i = 0; i < values.length; i++) sumSquares += (inner[i] - outer[i]) ** 2;
  return Math.sqrt(sumSquares / values.length);
}

function boxBlur(values, width, height, radius) {
  const horizontal = new Float64Array(values.length);
  const result = new Float64Array(values.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += values[y * width + clampIndex(x, width)];
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / (radius * 2 + 1);
      sum += values[y * width + clampIndex(x + radius + 1, width)];
      sum -= values[y * width + clampIndex(x - radius, width)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += horizontal[clampIndex(y, height) * width + x];
    for (let y = 0; y < height; y++) {
      result[y * width + x] = sum / (radius * 2 + 1);
      sum += horizontal[clampIndex(y + radius + 1, height) * width + x];
      sum -= horizontal[clampIndex(y - radius, height) * width + x];
    }
  }
  return result;
}

function srgbToOklab(r, g, b) {
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function linearize(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function percentile(sorted, ratio) {
  const position = (sorted.length - 1) * ratio;
  const lo = Math.floor(position);
  const t = position - lo;
  return sorted[lo] * (1 - t) + sorted[Math.min(lo + 1, sorted.length - 1)] * t;
}

function clampIndex(value, length) {
  return Math.max(0, Math.min(length - 1, value));
}

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}
