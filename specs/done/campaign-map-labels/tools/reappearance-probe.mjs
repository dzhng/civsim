#!/usr/bin/env node
// Slice 06 verification: league names reappear monotonically as the camera
// comes in. Holds a fixed center and steps the zoom up; the count of visible
// minor-faction (league) labels must be non-decreasing across the ladder until
// leagueHiFade retires faction engravings at close zoom (>~1.0), where cities
// take over. Also caps the overview count (no wall of text). The apparent
// "drops" when free-panning are labels leaving the shrinking viewport, so this
// keeps the center fixed and only compares counts, the density signal.
//   VERIFY_URL=http://localhost:5199 node reappearance-probe.mjs
import { createRequire } from "node:module";
const WEB = new URL("../../../web/", import.meta.url);
const { GPU_SWIFTSHADER_FLAGS } = await import(new URL("renderer-probe-lib.mjs", WEB));
const { chromium } = createRequire(WEB)("playwright");
const TARGET = process.env.VERIFY_URL ?? "http://localhost:5173";
const CENTER = [500, 300]; // Anatolia / east-Med — the league-dense band
const LADDER = [0.16, 0.4, 0.6, 0.85]; // overview → mid; leagues retire above ~1.0
const OVERVIEW_LEAGUE_BUDGET = 10; // whole-map must not be a wall of league names

const browser = await chromium.launch({ args: GPU_SWIFTSHADER_FLAGS });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { Math.random = () => 0.123456789; });
  await page.goto(`${TARGET}/?campaign=1`);
  await page.waitForFunction(
    () => window.__campaignReady === true && window.__campaignGpuStats?.ready === true,
    undefined, { timeout: 45000 });
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.factionView(true);
    window.__campaign.fogOfWar(false);
  });
  const counts = [];
  for (const scale of LADDER) {
    await page.evaluate(([cx, cy, s]) => window.__campaign.cam(cx, cy, s), [...CENTER, scale]);
    await page.waitForTimeout(200);
    const n = await page.evaluate(() =>
      (window.__campaignGpuStats.visibleFactionLabelRects || [])
        .filter((l) => l.minor && l.opacity >= 0.1).length);
    counts.push({ scale, leagues: n });
  }
  let ok = true;
  const failures = [];
  for (let i = 1; i < counts.length; i++) {
    if (counts[i].leagues < counts[i - 1].leagues) {
      ok = false;
      failures.push(`zoom ${counts[i - 1].scale}->${counts[i].scale}: ${counts[i - 1].leagues}->${counts[i].leagues} (dropped)`);
    }
  }
  if (counts[0].leagues > OVERVIEW_LEAGUE_BUDGET) {
    ok = false;
    failures.push(`overview shows ${counts[0].leagues} leagues > budget ${OVERVIEW_LEAGUE_BUDGET}`);
  }
  console.log(JSON.stringify({ counts, monotonicReappearance: ok, budget: OVERVIEW_LEAGUE_BUDGET, failures }, null, 2));
  process.exitCode = ok ? 0 : 1;
  await page.close();
} finally {
  await browser.close();
}
