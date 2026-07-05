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
  // zoom 5: David's rig tune (dc6b7e2e) clamps the whole 0-3 band to one
  // camera (dist 1200 / pitch 1.35), so zoom 3 no longer samples a MID rig.
  { name: "mid", zoom: 5.0, center: [0, 10] },
  // The vista must read a FORMATION at eye level, not the empty grass between
  // the armies — centre it on a red unit's anchor.
  { name: "vista", zoom: 9.5, centerOnTeam: 1 },
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
    // Absolute tick well past boot variance — freezeAtTick only advances
    // forward, so a low target freezes at a run-dependent world state.
    window.__game.freezeAtTick(4000);
    window.__cam.yaw = 0;
    window.__cam.pitchBias = 0;
  });
  await page.addStyleTag({
    content:
      "#gameover, #hud, #buttons, #pausemenu, #banner, #selbox, #minimap, #unitcards, #toolbar { display: none !important; }",
  });

  const frames = [];
  const rigs = [];
  for (const stop of STOPS) {
    await page.evaluate(async ({ zoom, center, centerOnTeam }) => {
      const cam = window.__cam;
      cam.zoom = zoom;
      cam.clampView?.();
      await new Promise((resolve) => setTimeout(resolve, 80));
      let cx = center ? center[0] : 0;
      let cy = center ? center[1] : 0;
      if (centerOnTeam !== undefined) {
        const g = window.__game;
        for (let u = 0; u < g.stats().units; u++) {
          const info = g.unitInfo(u);
          if (info[6] === centerOnTeam && info[15] > 0) {
            cx = info[0];
            cy = info[1];
            break;
          }
        }
      }
      cam.setViewCenter(cx, cy);
      window.__cam.clampView?.();
    }, stop);
    await page.waitForTimeout(160);
    const stats = await page.evaluate(() => window.__game.stats().renderStats.camera);
    rigs.push({ ...stop, ...stats });
    frames.push(PNG.sync.read(await page.locator("#battlefield").screenshot()));
  }

  // camera3d convention (slice 04): pitch π/2 = straight down, small = oblique;
  // pitch DECREASES and fovY/closeness INCREASE from tactical zoom-out to vista.
  // The rig is read from renderStats.camera.camera3d — the one projection owner
  // (the snapshot carries no separate pitch scalar since the 05b collapse).
  ctx.check(
    "zoom rig frames the widest view near top-down",
    rigs[0].zoomT < 0.2 && rigs[0].camera3d.pitch > 1.2,
    JSON.stringify(rigs[0]),
  );
  ctx.check(
    "zoom rig keeps playable mid zoom tilting off top-down",
    // Pitch ceiling re-anchored to David's rig tune (dc6b7e2e) - the mid
    // stop now sits at 1.35 by design.
    rigs[1].zoomT > 0.15 &&
      rigs[1].zoomT < 0.65 &&
      rigs[1].camera3d.pitch > 0.9 &&
      rigs[1].camera3d.pitch <= 1.4,
    JSON.stringify(rigs[1]),
  );
  ctx.check(
    "zoom rig reaches the close low-oblique vista band",
    rigs[2].zoomT === 1 &&
      rigs[2].camera3d.pitch < 0.4 &&
      rigs[2].camera3d.fovY > rigs[1].camera3d.fovY,
    JSON.stringify(rigs[2]),
  );
  ctx.check(
    "zoom rig progression is monotonic (pitch falls, fov widens, distance closes)",
    // Pitch is non-increasing (David's rig tune dc6b7e2e plateaus the
    // top->mid band at 1.35 by design); fov likewise may plateau.
    rigs[0].camera3d.pitch >= rigs[1].camera3d.pitch &&
      rigs[1].camera3d.pitch > rigs[2].camera3d.pitch &&
      rigs[0].camera3d.fovY <= rigs[1].camera3d.fovY &&
      rigs[1].camera3d.fovY < rigs[2].camera3d.fovY &&
      rigs[0].camera3d.distance > rigs[1].camera3d.distance &&
      rigs[1].camera3d.distance > rigs[2].camera3d.distance,
    JSON.stringify(rigs),
  );
  const metrics = frames.map(formationMetrics);
  ctx.check(
    "zoom rig contact sheet keeps formations readable at each stop",
    metrics[0].formationMass > 1000 &&
      metrics[1].formationMass > 1000 &&
      metrics[2].formationMass > 3500,
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
  let formationMass = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 16) continue;
      if (isCrowdMass(r, g, b)) formationMass++;
    }
  }
  return { formationMass };
}

function isCrowdMass(r, g, b) {
  const luma = r * 0.3 + g * 0.59 + b * 0.11;
  const greenField = g > r + 22 && g > b + 12;
  return luma > 34 && luma < 132 && r < 165 && g < 155 && b < 145 && !greenField;
}
