import { writeFile, mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { encodeGif, pngToRGBA, downscaleRGBA } from "../../shots/_gif.mjs";

// Slice 17: the retired `water-rhythm` lab gate's INTENT, re-pointed at the
// photoreal sea. The old gate filmed the bespoke WaterPlanePass over a fixed
// shader phase and dumped a review GIF; the production sea owner is now
// `seaLayer` (Gerstner-TSL), animated off the world's owned `setTime` uniform
// (the TSL `time` node is banned). This scene proves the sea *travels* rather
// than teleports: a fixed-t filmstrip, a committed looping GIF for eyeballing
// the swell rhythm, and a cadence check that every adjacent frame differs
// (motion, not a frozen field) while its delta stays bounded (a continuous
// swell, not a per-frame jump). Shore framing matches `photoreal-sea`.
export const meta = {
  name: "photoreal-sea-rhythm",
  kind: "visual",
  world: "battle-photoreal-sea-vista",
  tier: "full",
  snapshots: [
    "photoreal-sea-rhythm/film-00",
    "photoreal-sea-rhythm/film-01",
    "photoreal-sea-rhythm/film-02",
    "photoreal-sea-rhythm/film-03",
  ],
  describe:
    "Slice 17 photoreal sea rhythm: fixed-t filmstrip + looping GIF + travel-not-teleport cadence over the owned setTime uniform.",
};

// ~16 frames over ~3.2 s → 0.2 s per frame (delay 20 cs). Base t matches the
// photoreal-sea fixed-t register so the rhythm reads at the same swell state.
const FRAMES = 16;
const T0 = 18.0;
const DT = 0.2;
const DELAY_CS = 20;
// Sea band: shore + near swell + horizon, where all the motion lives.
const CROP = { x: 0, y: 360, width: 1280, height: 340 };
const GIF_DOWNSCALE = 2; // 1280x340 crop → 640x170 GIF, keeps the tracked artifact small.
const FILM_STOPS = [0, 5, 10, 15];

const GIF_DIR = new URL("../../shots/battle/photoreal-sea-rhythm/", import.meta.url);
const GIF_PATH = new URL("rhythm.gif", GIF_DIR).pathname;

function seaQuery(t) {
  return new URLSearchParams({
    // Map C = CoastalScrub: ocean on the WEST edge; look west over the water.
    map: "C",
    ref: "1",
    t: String(t),
    ticks: "60",
    sea: "gerstner",
    zoom: "8.0",
    cx: "-1115",
    cy: "-150",
    pitch: "0.28",
    yaw: "0",
  });
}

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("photoreal-sea-rhythm requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "sea-rhythm",
  });
  try {
    const cropped = [];
    let seaStats = null;
    let atmosphere = null;
    for (let i = 0; i < FRAMES; i++) {
      const t = Number((T0 + i * DT).toFixed(4));
      // Clean full navigation each frame so waitForFunction can never latch the
      // previous frame's stats (the lab is an SPA — a bare query change is a soft
      // nav that leaves the old context alive mid-teardown).
      await page.goto("about:blank");
      await page.goto(`${ctx.target}/renderer/photoreal-battle?${seaQuery(t)}`);
      // The route applies the fixed `t` param through world.setTime every frame,
      // so once the sea terrain is present the frame is deterministically at t.
      await page.waitForFunction(
        () =>
          window.__rendererLabReady === true &&
          window.__rendererLabStats?.ok === true &&
          window.__rendererLabStats?.route === "photoreal-battle" &&
          window.__rendererLabStats?.stats?.renderStats?.terrain?.sea,
        undefined,
        { timeout: 180000 },
      );
      await page.waitForTimeout(200);
      await page
        .evaluate(() => window.__photorealBattleWorld?.settlePresentedFrame?.())
        .catch(() => {});
      if (i === 0) {
        const stats = await page.evaluate(
          () => window.__rendererLabStats?.stats?.renderStats ?? null,
        );
        seaStats = stats?.sea ?? null;
        atmosphere = stats?.atmosphere ?? null;
      }
      const full = await page.locator("#renderer-canvas").screenshot({ timeout: 180000 });
      cropped.push(cropPng(full, CROP));
    }

    // Sea owner identity: the rhythm films the ONE photoreal water seam, not a
    // revived bespoke path.
    ctx.check(
      "sea-rhythm: Gerstner-TSL is the only active displacement tier",
      seaStats?.requested === "gerstner-tsl" &&
        seaStats?.source === "gerstner-tsl" &&
        seaStats?.tier === "gerstner-tsl" &&
        seaStats?.fallback === false,
      JSON.stringify(seaStats),
    );
    ctx.check(
      "sea-rhythm: aerial haze still owned by aerialPerspective",
      atmosphere?.sky?.owner === "skyModel" && atmosphere?.aerial?.owner === "aerialPerspective",
      JSON.stringify(atmosphere),
    );

    // Travel-not-teleport cadence: every adjacent frame must differ (the swell
    // moves — not a frozen field) but the per-frame delta stays bounded (a
    // continuous swell over the owned time uniform — not a teleport/reseed).
    const deltas = [];
    for (let i = 1; i < cropped.length; i++) {
      deltas.push(meanAbsLumaDelta(PNG.sync.read(cropped[i - 1]), PNG.sync.read(cropped[i])));
    }
    const minDelta = Math.min(...deltas);
    const maxDelta = Math.max(...deltas);
    ctx.check(
      "sea-rhythm: every adjacent frame travels (no frozen frame)",
      minDelta > 0.15,
      `minDelta=${minDelta.toFixed(3)} deltas=${deltas.map((d) => d.toFixed(2)).join(",")}`,
    );
    ctx.check(
      "sea-rhythm: adjacent-frame delta is bounded (swell travels, no teleport)",
      maxDelta < 6.0,
      `maxDelta=${maxDelta.toFixed(3)}`,
    );

    // Committed review GIF (like the old rhythm.gif) — downscaled so the tracked
    // artifact stays small; the filmstrip PNGs are the full-detail baselines.
    const gifFrames = cropped.map((buf) => downscaleRGBA(pngToRGBA(buf), GIF_DOWNSCALE));
    const gif = encodeGif(gifFrames, gifFrames[0].width, gifFrames[0].height, DELAY_CS, {
      loop: true,
    });
    await mkdir(GIF_DIR, { recursive: true });
    await writeFile(GIF_PATH, gif);
    ctx.check(
      "sea-rhythm: looping review GIF written",
      gif.length > 0 && gifFrames.length === FRAMES,
      `${gifFrames.length}f ${(gif.length / 1024).toFixed(0)}kb`,
    );

    // Fixed-t filmstrip baselines (4 evenly-spaced stops across the loop).
    for (let s = 0; s < FILM_STOPS.length; s++) {
      const idx = FILM_STOPS[s];
      await ctx.snap(null, `photoreal-sea-rhythm/film-0${s}`, { shot: cropped[idx] });
    }
  } finally {
    await page.close();
  }
}

function cropPng(buffer, rect) {
  const src = PNG.sync.read(buffer);
  const out = new PNG({ width: rect.width, height: rect.height });
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const si = ((rect.y + y) * src.width + rect.x + x) * 4;
      const di = (y * rect.width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

function meanAbsLumaDelta(a, b) {
  let sum = 0;
  const n = a.width * a.height;
  for (let i = 0; i < a.data.length; i += 4) {
    const la = 0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2];
    const lb = 0.2126 * b.data[i] + 0.7152 * b.data[i + 1] + 0.0722 * b.data[i + 2];
    sum += Math.abs(la - lb);
  }
  return sum / n;
}
