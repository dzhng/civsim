#!/usr/bin/env node
// Slice 03 instrument: overlay the sea-label fitter's verdicts on the
// whole-map political framing. Draws each drawn sea-label rect (renderer
// visibleSeaLabelRects) with a full-res render-mask sample grid inside it,
// plus the fitter's accepted placement stats (renderer seaLabelFits), so
// "fitted == drawn == on water" is checkable at a glance.
//
// The U2 diagnosis that shaped the fix (measured against the pre-fix fitter
// replica) is recorded in specs/campaign-map-bugs/slices/03-sea-labels.md.
//
// Run: VERIFY_URL=http://localhost:5203 VERIFY_GPU=1 \
//   node specs/campaign-map-bugs/visualizations/03-sea-labels-overlay.mjs
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from "../../../web/renderer-probe-lib.mjs";

const { chromium } = createRequire(new URL("../../../web/", import.meta.url))("playwright");

const TARGET = process.env.VERIFY_URL ?? "http://localhost:5173";
const VIEWPORT = { width: 1600, height: 1000 };
const WHOLE_MAP_CAMERA = [-100, 250, 0.16];
const OUT_HTML = join(dirname(fileURLToPath(import.meta.url)), "03-sea-labels-overlay.html");

function launchOptions() {
  if ((process.env.VERIFY_GPU ?? "1") !== "1") {
    throw new Error("needs VERIFY_GPU=1: sea-label stats are WebGPU renderer telemetry");
  }
  return {
    args:
      process.env.VERIFY_GPU_ADAPTER === "hardware" ? GPU_HARDWARE_FLAGS : GPU_SWIFTSHADER_FLAGS,
    ...(process.env.VERIFY_HEADFUL === "1" ? { headless: false } : {}),
    ...(process.env.VERIFY_BROWSER_CHANNEL ? { channel: process.env.VERIFY_BROWSER_CHANNEL } : {}),
  };
}

function measureInPage(camera) {
  const api = window.__campaign;
  const stats = window.__campaignGpuStats;
  const fitsByText = new Map((stats.seaLabelFits ?? []).map((fit) => [fit.text, fit]));
  // Same inside-the-rotated-quad filter as tools/render-probe.mjs: the
  // axis-aligned bbox of a steeply rotated label is mostly empty corners.
  const pointInQuad = (point, corners) => {
    let sign = 0;
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
      if (Math.abs(cross) < 1e-6) continue;
      const next = Math.sign(cross);
      if (sign === 0) sign = next;
      else if (sign !== next) return false;
    }
    return true;
  };
  const labels = (stats.visibleSeaLabelRects ?? []).map((rect) => {
    const grid = [];
    let land = 0;
    const cols = 25;
    const rows = 11;
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const sx = rect.box.x + (rect.box.w * (ix + 0.5)) / cols;
        const sy = rect.box.y + (rect.box.h * (iy + 0.5)) / rows;
        if (!pointInQuad([sx, sy], rect.corners)) continue;
        const [wx, wy] = api.screenToWorld(sx, sy);
        const isLand = api.renderLandAt(wx, wy, 0);
        if (isLand) land++;
        grid.push({ sx: Math.round(sx), sy: Math.round(sy), land: isLand });
      }
    }
    return {
      text: rect.text,
      box: rect.box,
      corners: rect.corners,
      landFraction: Math.round((land / grid.length) * 1000) / 1000,
      fit: fitsByText.get(rect.text) ?? null,
      grid,
    };
  });
  return {
    camera,
    fitZoom: stats.seaLabelFitZoom,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    labels,
  };
}

function overlayHtml(shotBase64, report) {
  const svgParts = [];
  for (const label of report.labels) {
    for (const s of label.grid) {
      svgParts.push(
        `<circle cx="${s.sx}" cy="${s.sy}" r="1.6" fill="${s.land ? "#ff3b30" : "#3b82f6"}" opacity="${s.land ? 0.95 : 0.4}"/>`,
      );
    }
    const corners = label.corners.map((p) => p.join(",")).join(" ");
    const clean = label.landFraction <= 0.05;
    svgParts.push(
      `<polygon points="${corners}" fill="none" stroke="${clean ? "#34d399" : "#ff3b30"}" stroke-width="2"/>`,
      `<text x="${label.box.x}" y="${label.box.y - 6}" fill="${clean ? "#34d399" : "#ff3b30"}" font-size="13" font-family="monospace">${label.text} land=${label.landFraction}</text>`,
    );
  }
  const rows = report.labels
    .map(
      (l) => `<tr>
        <td>${l.text}</td>
        <td>${l.landFraction}</td>
        <td>${l.fit ? l.fit.scale.toFixed(2) : "—"}</td>
        <td>${l.fit ? Math.round(l.fit.nudgeKm) : "—"}</td>
        <td>${l.fit ? l.fit.landFraction : "—"}</td>
      </tr>`,
    )
    .join("\n");
  return `<!doctype html>
<meta charset="utf-8">
<title>03 sea-labels: drawn boxes vs render mask (whole-map political)</title>
<style>
  body { margin: 0; background: #111; color: #ddd; font: 14px/1.5 system-ui; }
  .stage { position: relative; width: ${report.viewport.width}px; }
  .stage img, .stage svg { position: absolute; inset: 0; }
  table { border-collapse: collapse; margin: 16px; }
  td, th { border: 1px solid #444; padding: 4px 10px; font-size: 13px; }
  .legend { margin: 12px 16px; }
  .legend span { margin-right: 18px; }
</style>
<div class="stage" style="height:${report.viewport.height}px">
  <img src="data:image/png;base64,${shotBase64}" width="${report.viewport.width}" height="${report.viewport.height}">
  <svg width="${report.viewport.width}" height="${report.viewport.height}" viewBox="0 0 ${report.viewport.width} ${report.viewport.height}">${svgParts.join("\n")}</svg>
</div>
<div class="legend">
  <span style="color:#34d399">□ drawn sea-label rect, ≤ 5% land (gate green)</span>
  <span style="color:#ff3b30">□ &gt; 5% land / ● render mask says LAND</span>
  <span style="color:#3b82f6">● render mask says water</span>
  <span>fit zoom ${report.fitZoom} CSS px/km, camera ${report.camera.join(", ")}</span>
</div>
<table>
  <tr><th>label</th><th>drawn-box land fraction (render mask)</th><th>fit scale</th><th>fit nudge km</th><th>fit land fraction</th></tr>
  ${rows}
</table>
`;
}

async function main() {
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error("[pageerror]", e.message));
    await page.addInitScript(() => {
      Math.random = () => 0.123456789;
    });
    await page.goto(`${TARGET}/?campaign=1`);
    await page.waitForFunction(
      () =>
        window.__campaignReady === true &&
        window.__campaignGpuStats?.ready === true &&
        window.__campaignGpuStats?.renderer === "renderer-campaign",
      undefined,
      { timeout: 45000 },
    );
    await page.evaluate((camera) => {
      window.__campaign.freeze(true);
      window.__campaign.fogOfWar(false);
      window.__campaign.factionView(true);
      window.__campaign.select(-1);
      window.__campaign.cam(...camera);
    }, WHOLE_MAP_CAMERA);
    await page.waitForTimeout(400);
    const report = await page.evaluate(measureInPage, WHOLE_MAP_CAMERA);
    const shot = await page.screenshot();
    await writeFile(OUT_HTML, overlayHtml(shot.toString("base64"), report));
    console.error(`[03-overlay] wrote ${OUT_HTML}`);
    for (const l of report.labels) {
      console.log(
        l.text.padEnd(20),
        `drawnLand=${l.landFraction}`,
        l.fit ? `fit scale=${l.fit.scale.toFixed(2)} nudge=${Math.round(l.fit.nudgeKm)} land=${l.fit.landFraction}` : "no fit record",
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e.stack ?? String(e));
  process.exitCode = 1;
});
