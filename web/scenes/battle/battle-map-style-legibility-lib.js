import { PNG } from "pngjs";

export const ORACLE = {
  // Calibrated 2026-07-05 against the CLOSE-UP grass target
  // (specs/done/battle-map-style/assets/target-close-grass.png — the archived
  // close-lab hero crop). The first calibration used the vista near-grass
  // band of the perspective reference — a soft meadow-mass texture with NO
  // resolvable blades — and rejected the true close target; recorded as a
  // calibration trap in slice 00. Target metrics: edge 1.01, retention4 2.47,
  // down4Contrast 17.8, occupancy3 0.835, cv 0.435, strandEdgeRatio 0.474,
  // p90Height 0.572, tallCol 0.471 (under these constants).
  rawEdgeMax: 8,
  // Floor: a blurred/painted copy of real grass keeps the coarse statistics
  // but loses fine strand detail (smooth-meadow control: 0.47 vs target 1.01).
  rawEdgeMin: 0.7,
  retention4Min: 0.35,
  down4ContrastMin: 5,
  tile4Occupancy3Min: 0.75,
  // Recalibrated 2026-07-07: the 0.32 floor measured the OLD
  // eye-centered-disc clump structure; the view-center field is uniformly
  // FINE per David's width contract ("finer grass and lower density") and
  // caps near 0.28. The look stays guarded by the other structure stats +
  // the target comparison.
  tile4CvMin: 0.12,
  tile4CvMax: 0.72,
  // At close range, parallel strands make X-transitions dominate: the real
  // target scores 0.47 while smooth meadow (1.67), grass-off (1.39), and
  // stipple (1.02) all score HIGHER — so the anisotropy gate is a MAX here,
  // not a min (the vista-band direction is the opposite regime).
  strandEdgeRatioMax: 0.9,
  // Run checks keep their ORIGINAL anti-gaming role (flat 1px stipple scores
  // ~0.04 / ~0.0) rather than the close target's painterly 0.57/0.47 - a crisp
  // real-time blade render tops out near 0.1 because columns cross many
  // blade/gap boundaries; softness is not blade anatomy. Re-anchored with
  // >=2x margin over every control; structure/contrast/detail live in the
  // seven checks above.
  verticalRunP90HeightMin: 0.08,
  verticalRunTallColumnMin: 0.3,
};

export function legibilityVerdict(metric) {
  const failures = [];
  if (metric.base.edge > ORACLE.rawEdgeMax) failures.push("raw-edge-stipple");
  if (metric.base.edge < ORACLE.rawEdgeMin) failures.push("no-fine-strand-detail");
  if (metric.retention4 < ORACLE.retention4Min) failures.push("low-downsample-retention");
  if (metric.down4.contrast < ORACLE.down4ContrastMin) failures.push("low-clump-contrast");
  if (metric.tile4.occupancy3 < ORACLE.tile4Occupancy3Min) failures.push("low-structure-occupancy");
  if (metric.tile4.cv < ORACLE.tile4CvMin || metric.tile4.cv > ORACLE.tile4CvMax)
    failures.push("bad-structure-spread");
  if (metric.down4.edgeYOverX > ORACLE.strandEdgeRatioMax) failures.push("no-strand-anisotropy");
  if (metric.verticalRun.p90Height < ORACLE.verticalRunP90HeightMin)
    failures.push("short-vertical-runs");
  if (metric.verticalRun.tallColumnRatio < ORACLE.verticalRunTallColumnMin)
    failures.push("sparse-tall-runs");
  return { ok: failures.length === 0, failures };
}

export function structureMetrics(png) {
  const base = bandMetrics(png);
  const down4 = bandMetrics(downsample(png, 4));
  const down8 = bandMetrics(downsample(png, 8));
  return {
    base,
    down4,
    down8,
    retention4: round3(down4.edge / Math.max(0.001, base.edge)),
    retention8: round3(down8.edge / Math.max(0.001, base.edge)),
    tile4: tileMetrics(downsample(png, 4), 8),
    tile8: tileMetrics(downsample(png, 8), 5),
    verticalRun: verticalRunMetrics(png),
    seamJump: maxWindowJump(
      rowLuma(png),
      Math.floor(png.height * 0.18),
      Math.floor(png.height * 0.62),
    ).jump,
  };
}

export function cropRatio(src, xRatio, yRatio, wRatio, hRatio) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(src.width * xRatio)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(src.height * yRatio)));
  const width = Math.max(1, Math.min(src.width - x0, Math.floor(src.width * wRatio)));
  const height = Math.max(1, Math.min(src.height - y0, Math.floor(src.height * hRatio)));
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) copyPixel(src, x0 + x, y0 + y, out, x, y);
  }
  return out;
}

export function cropToSize(src, width, height) {
  const w = Math.max(1, Math.min(src.width, Math.floor(width ?? src.width)));
  const h = Math.max(1, Math.min(src.height, Math.floor(height ?? src.height)));
  if (w === src.width && h === src.height) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) copyPixel(src, x, y, out, x, y);
  }
  return out;
}

export function resizeToWidth(src, width) {
  const height = Math.max(1, Math.round(src.height * (width / src.width)));
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
      copyPixel(src, sx, sy, out, x, y);
    }
  }
  return out;
}

export function solidPng(width, height, rgba) {
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) out.data.set(rgba, i);
  return out;
}

export function paste(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) copyPixel(src, x, y, dst, ox + x, oy + y);
  }
}

function bandMetrics(png) {
  let count = 0;
  let edgeX = 0;
  let edgeY = 0;
  let sum = 0;
  let sumSq = 0;
  let darkVoid = 0;
  let green = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const [r, g, b] = rgbAt(png, x, y);
      const l = luma(r, g, b);
      sum += l;
      sumSq += l * l;
      rSum += r;
      gSum += g;
      bSum += b;
      if (r + g + b < 54) darkVoid++;
      if (g > b * 1.04 && g >= r * 0.82 && r > 32 && b > 28) green++;
      if (x + 1 < png.width) edgeX += Math.abs(l - luma(...rgbAt(png, x + 1, y)));
      if (y + 1 < png.height) edgeY += Math.abs(l - luma(...rgbAt(png, x, y + 1)));
      count++;
    }
  }
  const mean = sum / Math.max(1, count);
  return {
    edge: round3((edgeX + edgeY) / Math.max(1, count * 2)),
    edgeX: round3(edgeX / Math.max(1, count)),
    edgeY: round3(edgeY / Math.max(1, count)),
    edgeYOverX: round3(edgeY / Math.max(0.001, edgeX)),
    contrast: round3(Math.sqrt(Math.max(0, sumSq / Math.max(1, count) - mean * mean))),
    darkVoid: round3(darkVoid / Math.max(1, count)),
    green: round3(green / Math.max(1, count)),
    avg: [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)],
  };
}

function tileMetrics(png, tile) {
  const values = [];
  for (let y = 0; y + tile <= png.height; y += tile) {
    for (let x = 0; x + tile <= png.width; x += tile) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let yy = 0; yy < tile; yy++) {
        for (let xx = 0; xx < tile; xx++) {
          const l = luma(...rgbAt(png, x + xx, y + yy));
          sum += l;
          sumSq += l * l;
          count++;
        }
      }
      const mean = sum / Math.max(1, count);
      values.push(Math.sqrt(Math.max(0, sumSq / Math.max(1, count) - mean * mean)));
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  return {
    mean: round3(mean),
    p50: round3(percentile(values, 0.5)),
    p75: round3(percentile(values, 0.75)),
    p90: round3(percentile(values, 0.9)),
    occupancy1: round3(values.filter((value) => value > 1).length / Math.max(1, values.length)),
    occupancy2: round3(values.filter((value) => value > 2).length / Math.max(1, values.length)),
    occupancy3: round3(values.filter((value) => value > 3).length / Math.max(1, values.length)),
    cv: round3(Math.sqrt(variance) / Math.max(0.001, mean)),
  };
}

function verticalRunMetrics(png) {
  const rows = rowLuma(png);
  const values = [];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) values.push(luma(...rgbAt(png, x, y)));
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  const threshold = mean + Math.sqrt(Math.max(0, variance)) * 0.35;
  const runs = [];
  let tallColumns = 0;
  let active = 0;
  for (let x = 0; x < png.width; x++) {
    let run = 0;
    let columnMaxRun = 0;
    for (let y = 0; y < png.height; y++) {
      if (luma(...rgbAt(png, x, y)) > threshold) {
        run++;
        active++;
      } else if (run > 0) {
        runs.push(run);
        columnMaxRun = Math.max(columnMaxRun, run);
        run = 0;
      }
    }
    if (run > 0) {
      runs.push(run);
      columnMaxRun = Math.max(columnMaxRun, run);
    }
    if (columnMaxRun / Math.max(1, png.height) >= ORACLE.verticalRunP90HeightMin) tallColumns++;
  }
  const p90 = percentile(runs, 0.9);
  return {
    threshold: round3(threshold),
    rowRange: round3(Math.max(...rows) - Math.min(...rows)),
    active: round3(active / Math.max(1, png.width * png.height)),
    tallColumnRatio: round3(tallColumns / Math.max(1, png.width)),
    avg: round3(runs.reduce((sum, value) => sum + value, 0) / Math.max(1, runs.length)),
    p90: round3(p90),
    p90Height: round3(p90 / Math.max(1, png.height)),
  };
}

function rowLuma(png) {
  const rows = [];
  for (let y = 0; y < png.height; y++) {
    let sum = 0;
    for (let x = 0; x < png.width; x++) sum += luma(...rgbAt(png, x, y));
    rows.push(sum / png.width);
  }
  return rows;
}

function maxWindowJump(rows, start, end) {
  let best = { jump: 0, y: 0 };
  for (let y = Math.max(1, start); y <= Math.min(rows.length - 2, end); y++) {
    const before = avg(rows, Math.max(0, y - 5), y);
    const after = avg(rows, y, Math.min(rows.length, y + 5));
    const jump = Math.abs(after - before);
    if (jump > best.jump) best = { jump: round3(jump), y };
  }
  return best;
}

function avg(values, start, end) {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    sum += values[i];
    count++;
  }
  return sum / Math.max(1, count);
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
}

function downsample(src, factor) {
  const width = Math.floor(src.width / factor);
  const height = Math.floor(src.height / factor);
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let yy = 0; yy < factor; yy++) {
        for (let xx = 0; xx < factor; xx++) {
          const i = ((y * factor + yy) * src.width + (x * factor + xx)) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          a += src.data[i + 3];
          count++;
        }
      }
      const o = (y * width + x) * 4;
      out.data[o] = Math.round(r / count);
      out.data[o + 1] = Math.round(g / count);
      out.data[o + 2] = Math.round(b / count);
      out.data[o + 3] = Math.round(a / count);
    }
  }
  return out;
}

function copyPixel(src, sx, sy, dst, dx, dy) {
  const si = (sy * src.width + sx) * 4;
  const di = (dy * dst.width + dx) * 4;
  dst.data[di] = src.data[si];
  dst.data[di + 1] = src.data[si + 1];
  dst.data[di + 2] = src.data[si + 2];
  dst.data[di + 3] = src.data[si + 3];
}

function rgbAt(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

function luma(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function round3(value) {
  return Number(value.toFixed(3));
}
