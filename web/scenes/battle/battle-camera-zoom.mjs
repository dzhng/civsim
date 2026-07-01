import { PNG } from "pngjs";

export const meta = {
  name: "battle-camera-zoom",
  kind: "visual",
  world: "battle-5v5",
  tier: "quick",
  snapshots: ["battle-camera-zoom"],
  describe:
    "Battle camera pitch and target offset progress from tactical zoom-out to close horizon vista.",
};

const STOPS = [
  { name: "top", zoom: 0.4, center: [0, 0] },
  { name: "mid", zoom: 3.0, center: [0, 10] },
  { name: "vista", zoom: 9.5, center: [0, 90] },
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "requires WebGPU browser flags",
      true,
      "set VERIFY_GPU=1 to capture WebGPU battle camera zoom",
    );
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-camera-zoom",
  });
  await page.goto(`${ctx.target}?battle=5v5&ai=off`);
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.ready === true &&
        stats.renderStats.soldiers === stats.soldiers
      );
    },
    undefined,
    { timeout: 20000 },
  );

  await page.evaluate(() => {
    window.__game.freezeAtTick(72);
    window.__cam.yaw = 0;
    window.__cam.pitchBias = 0;
  });
  await page.addStyleTag({
    content:
      "#gameover, #hud, #buttons, #pausemenu, #banner, #selbox, #minimap, #unitlabels, #unitcards, #toolbar { display: none !important; }",
  });

  const frames = [];
  const rigs = [];
  for (const stop of STOPS) {
    await page.evaluate(async ({ zoom, center }) => {
      const cam = window.__cam;
      cam.zoom = zoom;
      cam.clampView?.();
      await new Promise((resolve) => setTimeout(resolve, 80));
      cam.setViewCenter(center[0], center[1]);
      window.__cam.clampView?.();
    }, stop);
    await page.waitForTimeout(160);
    const stats = await page.evaluate(() => window.__game.stats().renderStats.camera);
    rigs.push({ ...stop, ...stats });
    frames.push(PNG.sync.read(await page.locator("#battlefield").screenshot()));
  }

  ctx.check(
    "zoom rig clamps the widest view to tactical zoomT=0",
    rigs[0].zoomT < 0.01 &&
      rigs[0].pitch < 0.16 &&
      rigs[0].targetOffset < 0.01 &&
      rigs[0].perspective < 0.0001,
    JSON.stringify(rigs[0]),
  );
  ctx.check(
    "zoom rig keeps playable mid zoom in an RTS pitch band",
    rigs[1].zoomT > 0.15 && rigs[1].zoomT < 0.65 && rigs[1].pitch > 0.18 && rigs[1].pitch < 0.5,
    JSON.stringify(rigs[1]),
  );
  ctx.check(
    "zoom rig reaches the close low-oblique vista band",
    rigs[2].zoomT === 1 &&
      rigs[2].pitch > 0.68 &&
      rigs[2].targetOffset > rigs[1].targetOffset &&
      rigs[2].perspective > rigs[1].perspective,
    JSON.stringify(rigs[2]),
  );
  ctx.check(
    "zoom rig progression is monotonic",
    rigs[0].pitch < rigs[1].pitch &&
      rigs[1].pitch < rigs[2].pitch &&
      rigs[0].targetOffset < rigs[1].targetOffset &&
      rigs[1].targetOffset < rigs[2].targetOffset &&
      rigs[0].perspective < rigs[1].perspective &&
      rigs[1].perspective < rigs[2].perspective,
    JSON.stringify(rigs),
  );
  const metrics = frames.map(formationMetrics);
  ctx.check(
    "zoom rig contact sheet keeps formations readable at each stop",
    metrics[0].redTeam + metrics[0].blueTeam > 2000 &&
      metrics[1].redTeam > 2500 &&
      metrics[2].redTeam > 7000,
    JSON.stringify(metrics),
  );

  await ctx.snap(page, "battle-camera-zoom", { shot: PNG.sync.write(contactSheet(frames)) });
  await page.close();
}

function contactSheet(frames) {
  const gap = 4;
  const width = frames.reduce((sum, frame) => sum + frame.width, 0) + gap * (frames.length - 1);
  const height = Math.max(...frames.map((frame) => frame.height));
  const out = new PNG({ width, height, colorType: 6 });
  out.data.fill(86);
  let x0 = 0;
  for (const frame of frames) {
    for (let y = 0; y < frame.height; y++) {
      const src = y * frame.width * 4;
      const dst = (y * width + x0) * 4;
      frame.data.copy(out.data, dst, src, src + frame.width * 4);
    }
    x0 += frame.width + gap;
  }
  return out;
}

function formationMetrics(png) {
  let redTeam = 0;
  let blueTeam = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      if (r > g + 22 && r > b + 26 && r > 105) redTeam++;
      if (b > r + 24 && b > g + 8) blueTeam++;
    }
  }
  return { redTeam, blueTeam };
}
