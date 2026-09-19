import { mkdir, writeFile } from "node:fs/promises";

// Contact states pinned by independent canonical evidence. A held lab build at an
// unpinned tick cannot pass until its state is pinned the same way.
const CONTACT_STATE_HASHES = {
  9000: "9928381812590497427",
  12000: "17530755159512483058",
};

export const meta = {
  name: "battle-benchmark-complete",
  kind: "flow",
  world: "battle-real",
  tier: "full",
  snapshots: [],
  describe:
    "Actual menu runs the full camera benchmark, live or held in a renderer-only lab build, and exports its unmodified measurements.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(ctx.target);
  await page.locator("#menu-benchmark").click();
  await page.waitForFunction(() => window.__game?.benchmark, undefined, { timeout: 120000 });
  await page.waitForFunction(
    () => !["preparing", "running"].includes(window.__game.benchmark.status().phase),
    undefined,
    { timeout: 900000 },
  );
  const report = await page.evaluate(() => window.__game.benchmark.report());
  const out = new URL("../../reports/rendering/scenario-runs/battle-benchmark/", import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(new URL("complete.json", out), JSON.stringify(report));
  ctx.check(
    "entire live window completed",
    report.completeWindow && report.status.elapsedMs >= 300000,
  );
  ctx.check(
    "timing starts at the canonical tick",
    report.status.startTick === report.status.scenario.startTick,
  );
  const contactState = CONTACT_STATE_HASHES[report.status.scenario.startTick];
  ctx.check(
    "canonical contact state",
    contactState !== undefined && report.identity?.initialStateHash === contactState,
  );
  // A held lab build measures rendering only; its report must say so and prove the
  // authority never moved. Everything else here is the same camera-window contract.
  const held = report.scope;
  if (held) {
    ctx.check(
      "report declares a renderer-only held simulation",
      report.kind === "battle-benchmark-renderer-only" &&
        held.measurement === "renderer-only" &&
        held.simulation === "held" &&
        held.tick === report.status.startTick,
    );
    ctx.check(
      "simulation stayed exactly at the held state",
      report.status.tick === held.tick &&
        report.simulatedSeconds === 0 &&
        held.initialStateHash === report.identity?.initialStateHash &&
        held.finalStateHash === held.initialStateHash,
    );
  } else {
    ctx.check(
      "simulation remained live",
      report.status.tick > report.status.startTick && report.simulatedSeconds > 0,
    );
  }
  ctx.check(
    "all camera phases recorded",
    report.phases.every((phase) => phase.summary.validCount > 0),
  );
  const frames = report.frames;
  ctx.check(
    "camera reached near wide and horizon views",
    frames.some((f) => f.camera.distance < 46) &&
      frames.some((f) => f.camera.distance > 899) &&
      frames.some((f) => f.camera.pitch < 0.151),
  );
  ctx.check(
    "every recorded callback submitted a new primary frame",
    frames.every(
      (f, i) => i === 0 || f.renderer.renderedFrameId > frames[i - 1].renderer.renderedFrameId,
    ),
  );
  ctx.check(
    "recorded interval total agrees with run clock",
    Math.abs(report.summary.durationMs - report.status.elapsedMs) < 0.01,
  );
  await page.getByRole("heading", { name: "Five-minute result", exact: true }).waitFor();
  const actions = await page.getByRole("navigation", { name: "Benchmark actions" }).boundingBox();
  ctx.check(
    "result actions remain inside the initial viewport",
    actions && actions.y >= 0 && actions.y + actions.height <= 900,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const stream = await (await download).createReadStream();
  let body = "";
  for await (const chunk of stream) body += chunk;
  const exported = JSON.parse(body);
  ctx.check(
    "export retains the full raw recording",
    exported.frames.length === frames.length &&
      JSON.stringify(exported.summary) === JSON.stringify(report.summary),
  );
  // This scene verifies measurement validity; the unchanged production performance
  // gates and matched acceptance reports decide whether the game is fast enough.
}
