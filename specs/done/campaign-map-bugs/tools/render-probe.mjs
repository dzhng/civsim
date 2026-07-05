#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from "../../../../web/renderer-probe-lib.mjs";

// The tool lives under specs/, so playwright resolves from the web app's tree.
const { chromium } = createRequire(new URL("../../../../web/", import.meta.url))("playwright");

const TARGET = process.env.VERIFY_URL ?? "http://localhost:5173";
const VIEWPORT = { width: 1600, height: 1000 };
const FRAMINGS = [
  { name: "whole-map-political", camera: [-100, 250, 0.16], factionView: true },
  { name: "regional-italy", camera: [-430, 445, 3.0], factionView: true },
];
const GENERATED_BY = "CODEX-00-PROBE specs/done/campaign-map-bugs/tools/render-probe.mjs";
const DETACH_MARKER_PX = 16;

function parseArgs(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      out = argv[++i] ?? null;
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    } else if (!arg.startsWith("-") && out === null) {
      out = arg;
    } else {
      throw new Error(`unknown argument: ${arg}\nusage: VERIFY_URL=http://localhost:5173 VERIFY_GPU=1 node specs/done/campaign-map-bugs/tools/render-probe.mjs [--out report.json]`);
    }
  }
  return { out };
}

function log(message) {
  console.error(`[render-probe] ${message}`);
}

function launchOptions() {
  const verifyGpu = process.env.VERIFY_GPU ?? "1";
  if (verifyGpu !== "1") {
    throw new Error("render-probe requires VERIFY_GPU=1; the campaign renderer and label stats are WebGPU-owned");
  }
  const opts = {
    args:
      process.env.VERIFY_GPU_ADAPTER === "hardware"
        ? GPU_HARDWARE_FLAGS
        : GPU_SWIFTSHADER_FLAGS,
  };
  if (process.env.VERIFY_HEADFUL === "1") opts.headless = false;
  if (process.env.VERIFY_BROWSER_CHANNEL) opts.channel = process.env.VERIFY_BROWSER_CHANNEL;
  if (process.env.VERIFY_SLOW_MO) {
    const slowMo = Number(process.env.VERIFY_SLOW_MO);
    if (!Number.isFinite(slowMo) || slowMo < 0) {
      throw new Error(`VERIFY_SLOW_MO must be a non-negative number, got ${process.env.VERIFY_SLOW_MO}`);
    }
    opts.slowMo = slowMo;
  }
  return opts;
}

async function bootCampaign(page) {
  log(`opening ${TARGET}/?campaign=1`);
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
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.fogOfWar(false);
    window.__campaign.factionView(true);
    window.__campaign.select(-1);
  });
}

async function loadMap(page) {
  return page.evaluate(async () => {
    const response = await fetch("/data/campaign-map.json");
    if (!response.ok) throw new Error(`failed to fetch campaign map: ${response.status}`);
    return response.json();
  });
}

async function pose(page, framing) {
  log(`posing ${framing.name} camera=${framing.camera.join(",")}`);
  await page.evaluate((next) => {
    window.__campaign.freeze(true);
    window.__campaign.fogOfWar(false);
    window.__campaign.factionView(next.factionView);
    window.__campaign.select(-1);
    window.__campaign.cam(...next.camera);
  }, framing);
  await page.waitForTimeout(300);
  await page.waitForFunction(
    () => window.__campaignGpuStats?.ready === true && window.__campaignGpuStats?.renderer === "renderer-campaign",
    undefined,
    { timeout: 10000 },
  );
}

async function measureFraming(page, map, framing) {
  await pose(page, framing);
  const stats = await page.evaluate(() => window.__campaignGpuStats);
  assertTelemetry(stats, framing.name);
  const markerRadiusPx = maxCityMarkerRadius(stats);
  const [offshoreCities, seaLabels, cityLabels, cards] = await Promise.all([
    measureCities(page, map, stats),
    measureLabelRects(page, stats.visibleSeaLabelRects),
    // City rects deflate to the ink band (icon + glyphs): the box padding is
    // transparent halo margin, and the B2/B8 defect is visible ink on water.
    measureLabelRects(page, stats.visibleCityLabelRects.map(deflateToInkRect)),
    measureCards(page),
  ]);
  return {
    framing: {
      name: framing.name,
      camera: framing.camera,
      viewport: VIEWPORT,
    },
    markerRadiusPx,
    offshoreCities,
    maxDrawnIconOffsetPx: round(Math.max(0, ...offshoreCities.map((city) => city.drawnIconOffsetPx ?? 0))),
    seaLabels,
    cityLabels,
    cards,
  };
}

function assertTelemetry(stats, framingName) {
  const missing = [];
  if (!stats) missing.push("window.__campaignGpuStats");
  if (!stats?.cityMarkerRadiiPxByTier) missing.push("cityMarkerRadiiPxByTier");
  if (!Array.isArray(stats?.visibleSeaLabelRects)) missing.push("visibleSeaLabelRects");
  if (!Array.isArray(stats?.visibleCityLabelRects)) missing.push("visibleCityLabelRects");
  if (missing.length > 0) {
    throw new Error(`${framingName}: missing renderer telemetry: ${missing.join(", ")}`);
  }
}

function maxCityMarkerRadius(stats) {
  const byTier = stats.cityMarkerRadiiPxByTier ?? {};
  return round(Math.max(0, ...Object.values(byTier).map(Number).filter(Number.isFinite)));
}

async function measureCities(page, map, stats) {
  const cityNodes = map.nodes
    .map((node, index) => ({ ...node, index }))
    .filter((node) => node.kind === "city")
    .map((city) => {
      const rect = stats.visibleCityLabelRects.find((rect) => rect.text === city.name.toUpperCase());
      return rect?.iconRect ? { ...city, iconRect: rect.iconRect } : city;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.index - b.index);
  const result = await page.evaluate(
    ({ cities, detachPx, radiiByTier, viewport }) => {
      const api = window.__campaign;
      const out = [];
      for (const city of cities) {
        const [sx, sy] = api.project(city.pos[0], city.pos[1]);
        const radiusPx = Number(radiiByTier[String(city.tier)] ?? radiiByTier[city.tier] ?? 0);
        if (
          !Number.isFinite(sx) ||
          !Number.isFinite(sy) ||
          radiusPx <= 0 ||
          sx < -radiusPx ||
          sy < -radiusPx ||
          sx > viewport.width + radiusPx ||
          sy > viewport.height + radiusPx
        ) {
          continue;
        }
        const centerLand = api.renderLandAt(city.pos[0], city.pos[1], 0);
        const landFraction = markerLandFraction(api, sx, sy, radiusPx);
        const drawnIconLandFraction = city.iconRect ? rectLandFraction(api, city.iconRect) : undefined;
        const drawnIconOffsetPx = city.iconRect
          ? Math.hypot(city.iconRect.x + city.iconRect.w / 2 - sx, city.iconRect.y + city.iconRect.h / 2 - sy)
          : undefined;
        if (
          centerLand &&
          landFraction >= 1 &&
          (city.iconRect ? drawnIconOffsetPx <= detachPx : true)
        ) {
          continue;
        }
        const row = {
          name: city.name,
          index: city.index,
          tier: city.tier,
          centerLand,
          // Area-average of the mask over the rendered marker disc: the
          // linear downsample the player sees blends sub-pixel land away, so
          // "marker floats on open water" = tiny landFraction, while an
          // ordinary port keeps a solid land share inside its footprint.
          landFraction: roundLocal(landFraction),
          marginKm: marginKmToWater(api, city.pos[0], city.pos[1]),
          screen: { x: roundLocal(sx), y: roundLocal(sy) },
          markerRadiusPx: roundLocal(radiusPx),
        };
        if (drawnIconLandFraction !== undefined) {
          row.drawnIconLandFraction = roundLocal(drawnIconLandFraction);
        }
        if (drawnIconOffsetPx !== undefined) {
          row.drawnIconOffsetPx = roundLocal(drawnIconOffsetPx);
        }
        out.push(row);
      }
      return out;

      function markerLandFraction(api, sx, sy, radiusPx) {
        const steps = 6;
        let land = 0;
        let total = 0;
        for (let gy = -steps; gy <= steps; gy++) {
          for (let gx = -steps; gx <= steps; gx++) {
            const dx = (gx / steps) * radiusPx;
            const dy = (gy / steps) * radiusPx;
            if (Math.hypot(dx, dy) > radiusPx + 0.001) continue;
            const [wx, wy] = api.screenToWorld(sx + dx, sy + dy);
            total++;
            if (api.renderLandAt(wx, wy, 0)) land++;
          }
        }
        return total > 0 ? land / total : 0;
      }

      function rectLandFraction(api, rect) {
        let samples = 0;
        let land = 0;
        const cols = 13;
        const rows = 7;
        for (let iy = 0; iy < rows; iy++) {
          for (let ix = 0; ix < cols; ix++) {
            const sx = rect.x + (rect.w * (ix + 0.5)) / cols;
            const sy = rect.y + (rect.h * (iy + 0.5)) / rows;
            const [wx, wy] = api.screenToWorld(sx, sy);
            samples++;
            if (api.renderLandAt(wx, wy, 0)) land++;
          }
        }
        return samples > 0 ? land / samples : 0;
      }

      function marginKmToWater(api, wx, wy) {
        if (!api.renderLandAt(wx, wy, 0)) return 0;
        let lo = 0;
        let hi = 80;
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) * 0.5;
          if (api.renderLandAt(wx, wy, mid)) lo = mid;
          else hi = mid;
        }
        return roundLocal(lo);
      }

      function roundLocal(value) {
        return Math.round(value * 1000) / 1000;
      }
    },
    { cities: cityNodes, detachPx: DETACH_MARKER_PX, radiiByTier: stats.cityMarkerRadiiPxByTier, viewport: VIEWPORT },
  );
  return result.sort((a, b) => a.name.localeCompare(b.name) || a.index - b.index);
}

// City labels never rotate, so the ink rect is the axis-aligned box deflated
// by the exported per-side halo padding.
function deflateToInkRect(label) {
  const pad = label.padPx ?? 0;
  const box = {
    x: label.box.x + pad,
    y: label.box.y + pad,
    w: Math.max(1, label.box.w - pad * 2),
    h: Math.max(1, label.box.h - pad * 2),
  };
  return {
    ...label,
    box,
    corners: [
      [box.x, box.y],
      [box.x + box.w, box.y],
      [box.x + box.w, box.y + box.h],
      [box.x, box.y + box.h],
    ],
  };
}

// Post-layout, post-collision drawn label rects (sea or city icon+name boxes)
// sampled through the render mask to a per-rect landFraction.
async function measureLabelRects(page, rects) {
  const labels = rects
    .map((label) => ({
      text: label.text,
      box: label.box,
      corners: label.corners,
    }))
    .sort((a, b) => a.text.localeCompare(b.text));
  const result = await page.evaluate((labels) => {
    const api = window.__campaign;
    return labels.map((label) => {
      let samples = 0;
      let land = 0;
      const x0 = label.box.x;
      const y0 = label.box.y;
      const cols = 13;
      const rows = 7;
      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const sx = x0 + (label.box.w * (ix + 0.5)) / cols;
          const sy = y0 + (label.box.h * (iy + 0.5)) / rows;
          if (!pointInQuad([sx, sy], label.corners)) continue;
          const [wx, wy] = api.screenToWorld(sx, sy);
          samples++;
          if (api.renderLandAt(wx, wy, 0)) land++;
        }
      }
      return {
        text: label.text,
        landFraction: samples > 0 ? roundLocal(land / samples) : 0,
        samples,
        box: {
          x: roundLocal(label.box.x),
          y: roundLocal(label.box.y),
          w: roundLocal(label.box.w),
          h: roundLocal(label.box.h),
        },
      };
    });

    function pointInQuad(point, corners) {
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
    }

    function roundLocal(value) {
      return Math.round(value * 1000) / 1000;
    }
  }, labels);
  return result.sort((a, b) => a.text.localeCompare(b.text));
}

// Scenery (slice 06): the static candidate set is world-space data shared by
// every framing, so it is measured once, not per framing. Every candidate is
// classified twice through renderLandAt: center on water (margin 0, the hard
// B9 defect) and footprint over water (margin = size/2, the instance's
// rendered footprint radius — the same margin the builder gate applies).
// Green = both totals 0 with per-kind counts close to the pre-gate baseline
// (no mass extinction — see tools/README.md).
async function measureScenery(page) {
  return page.evaluate(() => {
    const api = window.__campaign;
    const items = api.sceneryCandidates();
    const byKind = {};
    const violations = [];
    for (const item of items) {
      const bucket = (byKind[item.kind] ??= { total: 0, onWater: 0, footprintOverWater: 0 });
      bucket.total++;
      const centerLand = api.renderLandAt(item.x, item.y, 0);
      const footprintLand = api.renderLandAt(item.x, item.y, item.size * 0.5);
      if (centerLand && footprintLand) continue;
      if (!centerLand) bucket.onWater++;
      if (!footprintLand) bucket.footprintOverWater++;
      if (violations.length < 50) {
        const [sx, sy] = api.project(item.x, item.y);
        violations.push({
          kind: item.kind,
          centerLand,
          world: { x: roundLocal(item.x), y: roundLocal(item.y) },
          screen: { x: roundLocal(sx), y: roundLocal(sy) },
          size: roundLocal(item.size),
        });
      }
    }
    return {
      total: items.length,
      onWaterTotal: Object.values(byKind).reduce((n, bucket) => n + bucket.onWater, 0),
      footprintOverWaterTotal: Object.values(byKind).reduce(
        (n, bucket) => n + bucket.footprintOverWater,
        0,
      ),
      byKind,
      violations,
    };

    function roundLocal(value) {
      return Math.round(value * 1000) / 1000;
    }
  });
}

async function measureCards(page) {
  const cards = await page.evaluate(() => {
    const api = window.__campaign;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    return [...document.querySelectorAll(".cmp-map-card--city")]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.right < 0 ||
          rect.bottom < 0 ||
          rect.left > viewport.width ||
          rect.top > viewport.height
        ) {
          return null;
        }
        const points = [
          [rect.left, rect.top],
          [rect.right, rect.top],
          [rect.right, rect.bottom],
          [rect.left, rect.bottom],
          [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
        ];
        let land = 0;
        for (const [sx, sy] of points) {
          const [wx, wy] = api.screenToWorld(sx, sy);
          if (api.renderLandAt(wx, wy, 0)) land++;
        }
        return {
          name: node.querySelector(".cmp-map-card__name")?.textContent?.trim() ?? "",
          landFraction: roundLocal(land / points.length),
          box: {
            x: roundLocal(rect.left),
            y: roundLocal(rect.top),
            w: roundLocal(rect.width),
            h: roundLocal(rect.height),
          },
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    function roundLocal(value) {
      return Math.round(value * 1000) / 1000;
    }
  });
  return cards;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pageErrors = [];
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await bootCampaign(page);
    const map = await loadMap(page);
    const framings = [];
    for (const framing of FRAMINGS) {
      framings.push(await measureFraming(page, map, framing));
    }
    // Re-pose the whole-map framing so violation screen coords are readable
    // (world-space classification itself is camera-independent).
    await pose(page, FRAMINGS[0]);
    const scenery = await measureScenery(page);
    if (pageErrors.length > 0) {
      throw new Error(`browser reported errors: ${pageErrors.slice(0, 5).join(" | ")}`);
    }
    const report = {
      "generated-by": GENERATED_BY,
      target: TARGET,
      scenery,
      framings,
    };
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (args.out) {
      const out = resolve(args.out);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, text);
      log(`wrote ${out}`);
    } else {
      process.stdout.write(text);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
