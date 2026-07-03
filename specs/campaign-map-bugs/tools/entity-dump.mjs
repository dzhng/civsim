#!/usr/bin/env node
// Slice 07a entity-dump probe: every city node -> is a city-model instance
// present in the renderer's entity frame? (U-Ostia diagnosis artifact.)
//
// Presence is measured against the renderer's own telemetry
// (`__campaignGpuStats.cityEntityAnchors`, the world anchors of the city
// entities uploaded to the GPU this frame), not re-derived from source logic.
// Each city node also reports whether its projected anchor point is covered by
// a visible DOM map card — the occlusion that made OSTIA/PORTUS "missing" in
// the B5 evidence crop.
//
// Run: VERIFY_URL=http://localhost:5207 VERIFY_GPU=1 \
//   node specs/campaign-map-bugs/tools/entity-dump.mjs [--out report.json]
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { GPU_HARDWARE_FLAGS, GPU_SWIFTSHADER_FLAGS } from "../../../web/renderer-probe-lib.mjs";

const { chromium } = createRequire(new URL("../../../web/", import.meta.url))("playwright");

const TARGET = process.env.VERIFY_URL ?? "http://localhost:5173";
const VIEWPORT = { width: 1600, height: 1000 };
// The B5 evidence framing (regional Italy political).
const FRAMING = { name: "regional-italy", camera: [-430, 445, 3.0] };
const GENERATED_BY = "specs/campaign-map-bugs/tools/entity-dump.mjs";

function parseArgs(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") out = argv[++i] ?? null;
    else if (arg.startsWith("--out=")) out = arg.slice("--out=".length);
    else if (!arg.startsWith("-") && out === null) out = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return { out };
}

function launchOptions() {
  if ((process.env.VERIFY_GPU ?? "1") !== "1") {
    throw new Error("entity-dump requires VERIFY_GPU=1; entity telemetry is WebGPU-owned");
  }
  return {
    args:
      process.env.VERIFY_GPU_ADAPTER === "hardware" ? GPU_HARDWARE_FLAGS : GPU_SWIFTSHADER_FLAGS,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pageErrors = [];
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => pageErrors.push(error.message));
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
    await page.evaluate((framing) => {
      window.__campaign.freeze(true);
      window.__campaign.fogOfWar(false);
      window.__campaign.factionView(true);
      window.__campaign.select(-1);
      window.__campaign.cam(...framing.camera);
    }, FRAMING);
    await page.waitForTimeout(300);

    const report = await page.evaluate(async () => {
      const api = window.__campaign;
      const stats = window.__campaignGpuStats;
      const anchors = stats.cityEntityAnchors ?? [];
      if (!Array.isArray(anchors) || anchors.length === 0) {
        throw new Error("renderer telemetry missing cityEntityAnchors");
      }
      const anchorKeys = new Set(anchors.map(([x, y]) => `${x},${y}`));
      const map = await (await fetch("/data/campaign-map.json")).json();
      const cardRects = [...document.querySelectorAll(".cmp-map-card")]
        .filter((node) => node.style.display !== "none")
        .map((node) => ({
          name: node.querySelector(".cmp-map-card__name")?.textContent?.trim() ?? "",
          rect: node.getBoundingClientRect(),
        }));
      const cities = [];
      let missing = 0;
      for (let index = 0; index < map.nodes.length; index++) {
        const node = map.nodes[index];
        if (node.kind !== "city") continue;
        const present = anchorKeys.has(`${node.pos[0]},${node.pos[1]}`);
        if (!present) missing++;
        const [sx, sy] = api.project(node.pos[0], node.pos[1]);
        const coveredBy = cardRects
          .filter(
            ({ rect }) => sx >= rect.left && sx <= rect.right && sy >= rect.top && sy <= rect.bottom,
          )
          .map(({ name }) => name);
        cities.push({
          index,
          name: node.name,
          tier: node.tier,
          present,
          centerLand: api.renderLandAt(node.pos[0], node.pos[1], 0),
          screen: [Math.round(sx), Math.round(sy)],
          anchorCoveredByCards: coveredBy,
        });
      }
      return {
        summary: {
          cityNodes: cities.length,
          cityEntityInstances: anchors.length,
          missingModels: missing,
          anchorsCoveredByCards: cities
            .filter((c) => c.anchorCoveredByCards.length > 0)
            .map((c) => `${c.name} <- ${c.anchorCoveredByCards.join("+")}`),
        },
        cities: cities.sort((a, b) => a.name.localeCompare(b.name) || a.index - b.index),
      };
    });
    if (pageErrors.length > 0) {
      throw new Error(`browser reported errors: ${pageErrors.slice(0, 5).join(" | ")}`);
    }
    const text = `${JSON.stringify(
      { "generated-by": GENERATED_BY, target: TARGET, framing: FRAMING, ...report },
      null,
      2,
    )}\n`;
    if (args.out) {
      const out = resolve(args.out);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, text);
      console.error(`[entity-dump] wrote ${out}`);
      console.error(`[entity-dump] summary ${JSON.stringify(report.summary)}`);
    } else {
      process.stdout.write(text);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
