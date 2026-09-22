import { writeFile, mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { encodeGif, pngToRGBA, downscaleRGBA } from "../../shots/_gif.mjs";

// Film one admitted TypeGPU ocean while advancing the route-owned clock.
// The fixed cadence and return to the first phase distinguish animation from
// renderer reconstruction or a changed camera between independent page loads.
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
    "The photoreal sea keeps a travel-not-teleport cadence across a fixed-time filmstrip and looping GIF.",
};

// ~16 frames over ~3.2 s → 0.2 s per frame (delay 20 cs). Base t matches the
// photoreal-sea fixed-t register so the rhythm reads at the same swell state.
const FRAMES = 16;
const T0 = 18.0;
const DT = 0.2;
const DELAY_CS = 20;
// The real camera looks across the field/ocean join; include both the moving
// ocean and its near boundary so the cadence check cannot film only flat field water.
const CROP = { x: 0, y: 0, width: 1280, height: 500 };
const GIF_DOWNSCALE = 2;
const FILM_STOPS = [0, 5, 10, 15];

const GIF_DIR = new URL("../../shots/battle/photoreal-sea-rhythm/", import.meta.url);
const GIF_PATH = new URL("rhythm.gif", GIF_DIR).pathname;

function seaQuery(t) {
  return new URLSearchParams({
    // Map C = CoastalScrub: face west from the shallows so deep blue
    // sea fills the frame; noon sky keeps the water blue.
    map: "C",
    ref: "1",
    env: "noon",
    t: String(t),
    ticks: "60",
    zoom: "7.8",
    cx: "-1180",
    cy: "-150",
    camYaw: "0",
    only: "battle-ground,battle-horizon,battle-ocean",
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
    const frames = [];
    await page.goto(`${ctx.target}/renderer/photoreal-battle?${seaQuery(T0)}`);
    await page.waitForFunction(
      () => {
        const stats = window.__rendererLabStats;
        if (stats?.ok === false) throw new Error(stats.error);
        return (
          window.__rendererLabReady === true &&
          stats?.ok === true &&
          stats.route === "photoreal-battle" &&
          stats.substrate === "typegpu" &&
          typeof window.__photorealBattleClock?.setTime === "function"
        );
      },
      undefined,
      { timeout: 180000 },
    );
    const setPhase = async (time) => {
      const revision = await page.evaluate(
        (value) => window.__photorealBattleClock.setTime(value),
        time,
      );
      await page.waitForFunction(
        ({ revision, time }) => {
          const stats = window.__rendererLabStats;
          if (stats?.ok === false) throw new Error(stats.error);
          return stats?.completedClockRevision === revision && stats.completedFrameTime === time;
        },
        { revision, time },
        { timeout: 180000 },
      );
      return page.evaluate(() => {
        const stats = window.__rendererLabStats;
        return {
          substrate: stats.substrate,
          prepared: stats.prepared,
          environment: stats.environment,
          camera: stats.preparedCamera,
          visibility: stats.reviewVisibility,
          terrain: stats.terrain,
          time: stats.completedFrameTime,
          revision: stats.completedClockRevision,
        };
      });
    };
    for (let i = 0; i < FRAMES; i++) {
      const time = Number((T0 + i * DT).toFixed(4));
      frames.push(await setPhase(time));
      const full = await page.locator("#renderer-canvas").screenshot({ timeout: 180000 });
      cropped.push(cropPng(full, CROP));
    }
    ctx.check(
      "sea-rhythm: each phase presents the admitted TypeGPU ocean with live geometry buffers",
      frames.every((frame) => {
        const terrain = frame.terrain;
        const water = terrain?.water;
        return (
          frame.substrate === "typegpu" &&
          frame.prepared === true &&
          frame.visibility?.water === true &&
          terrain?.installed === true &&
          terrain.replacing === false &&
          water?.disposed === false &&
          water.draws > 0 &&
          water.triangles > 0 &&
          water.ownedBuffers === water.draws * 4 &&
          water.surfaces.length === water.draws &&
          water.surfaces.every((surface) => surface.kind === "ocean" && surface.triangles > 0) &&
          water.depth === "read-write" &&
          water.blending === "opaque"
        );
      }),
      JSON.stringify(
        frames.map(({ terrain, time, revision }) => ({ time, revision, water: terrain?.water })),
      ),
    );
    ctx.check(
      "sea-rhythm: real camera and admitted water resources stay fixed throughout the film",
      frames.every(
        (frame) =>
          frame.environment === "noon" &&
          Math.abs(frame.camera?.camera3d?.yaw ?? NaN) < 1e-6 &&
          JSON.stringify(frame.camera) === JSON.stringify(frames[0].camera) &&
          JSON.stringify(frame.terrain?.water) === JSON.stringify(frames[0].terrain?.water),
      ),
      JSON.stringify({ camera: frames[0].camera, environment: frames[0].environment }),
    );
    await setPhase(T0);
    const returned = cropPng(
      await page.locator("#renderer-canvas").screenshot({ timeout: 180000 }),
      CROP,
    );
    ctx.check(
      "sea-rhythm: returning the owned clock to the first phase restores the same pixels",
      PNG.sync.read(returned).data.equals(PNG.sync.read(cropped[0]).data),
    );

    // Check aggregate travel and bound every step; stationary instants are allowed.
    // The interior crop excludes the field/shore join, so its motion cannot
    // falsely accept a frozen standalone ocean.
    const oceanFrames = cropped.map((frame) =>
      PNG.sync.read(
        cropPng(frame, {
          x: 64,
          y: 24,
          width: 1152,
          height: 128,
        }),
      ),
    );
    const oceanDeltas = oceanFrames
      .slice(1)
      .map((frame, i) => meanAbsLumaDelta(oceanFrames[i], frame));
    const oceanMeanDelta = oceanDeltas.reduce((a, b) => a + b, 0) / oceanDeltas.length;
    ctx.check(
      "sea-rhythm: standalone ocean interior moves independently of field-water effects",
      oceanMeanDelta > 0.004,
      `meanDelta=${oceanMeanDelta.toFixed(4)}`,
    );
    const deltas = [];
    for (let i = 1; i < cropped.length; i++) {
      deltas.push(meanAbsLumaDelta(PNG.sync.read(cropped[i - 1]), PNG.sync.read(cropped[i])));
    }
    const minDelta = Math.min(...deltas);
    const maxDelta = Math.max(...deltas);
    const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    // The calm open-water vista's swell is subtle at this distance, so judge
    // overall travel (mean delta) rather than demanding every single frame move
    // — a fully frozen field still fails, a teleport is caught by the max below.
    ctx.check(
      "sea-rhythm: the swell travels across the filmstrip (not a frozen field)",
      meanDelta > 0.004,
      `meanDelta=${meanDelta.toFixed(4)} minDelta=${minDelta.toFixed(3)} deltas=${deltas.map((d) => d.toFixed(2)).join(",")}`,
    );
    ctx.check(
      "sea-rhythm: adjacent-frame delta is bounded (swell travels, no teleport)",
      maxDelta < 6.0,
      `maxDelta=${maxDelta.toFixed(3)}`,
    );

    // Review replay: its wrap returns to the first phase, not a seamless wave period.
    // Downscaled so the tracked
    // artifact stays small; the filmstrip PNGs are the full-detail baselines.
    const gifFrames = cropped.map((buf) => downscaleRGBA(pngToRGBA(buf), GIF_DOWNSCALE));
    const gif = encodeGif(gifFrames, gifFrames[0].width, gifFrames[0].height, DELAY_CS, {
      loop: true,
      colorBits: 8,
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
