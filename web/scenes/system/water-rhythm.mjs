import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { encodeGif, pngToRGBA, downscaleRGBA } from "../../shots/_gif.mjs";

// Water Slice 7 — animation rhythm. The only slice judged across TIME. The
// spatial look is frozen from S2–S6; this watches the winner's open sea move: a
// filmstrip of fixed-`t` snaps (deterministic under injected time), a looping GIF
// for the eye, and a cadence check that the sea travels between frames (moves)
// without teleporting (no popping). `?t=<fixed>` freezes for snaps; the GIF
// sweeps `t` over a few seconds.
//
// GPU only (VERIFY_GPU=1); on this Mac use headless Chrome + hardware.

const WINNER = "gerstner";
const SHOTS_MISC = new URL("../../shots/misc/", import.meta.url).pathname;
const STRIP_T = [0, 0.8, 1.6, 2.4];
const GIF_T = Array.from({ length: 16 }, (_, i) => (i * 3.2) / 16); // 0..3s

export const meta = {
  name: "water-rhythm",
  kind: "flow",
  world: "none",
  tier: "full",
  snapshots: STRIP_T.map((_, i) => `water/rhythm-t${i}`),
  describe:
    "Water Slice 7: the open sea in motion — fixed-t filmstrip, a looping GIF, and a travel-not-teleport cadence check.",
};

const waitReady = (page) =>
  page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.route === "water-bakeoff",
    undefined,
    { timeout: 25000 },
  );

async function frameAt(ctx, page, t) {
  await page.goto(`${ctx.target}/renderer/water-bakeoff?tech=${WINNER}&preset=golden&t=${t}`);
  await waitReady(page);
  await page.waitForTimeout(120);
  return page.locator("#renderer-canvas").screenshot();
}

function meanDelta(a, b) {
  let s = 0;
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i += 4)
    s +=
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
  return s / (n / 4) / 3;
}

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 640, height: 400 }, errorPrefix: WINNER });
  try {
    // Filmstrip: deterministic fixed-t snaps.
    const firstStrip = await frameAt(ctx, page, STRIP_T[0]);
    await ctx.snap(page, "water/rhythm-t0", { shot: firstStrip });
    for (let i = 1; i < STRIP_T.length; i++) {
      const shot = await frameAt(ctx, page, STRIP_T[i]);
      await ctx.snap(page, `water/rhythm-t${i}`, { shot });
    }

    // Determinism: re-render t0 and confirm it is byte-identical to the first
    // strip frame (injected time is deterministic within a run).
    const repeat = await frameAt(ctx, page, STRIP_T[0]);
    ctx.check(
      "rhythm: injected time is deterministic (same t → byte-identical frame)",
      Buffer.compare(repeat, firstStrip) === 0,
      JSON.stringify({ bytes: firstStrip.length }),
    );

    // GIF sweep + cadence measurement.
    const buffers = [];
    for (const t of GIF_T) buffers.push(await frameAt(ctx, page, t));
    const pngs = buffers.map((b) => PNG.sync.read(b));

    const deltas = [];
    for (let i = 1; i < pngs.length; i++) deltas.push(meanDelta(pngs[i - 1], pngs[i]));
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const max = Math.max(...deltas);

    // The sea must MOVE between frames (avg delta above a floor) but never TELEPORT
    // (no single step wildly above the average → popping).
    ctx.check(
      "rhythm: the sea travels between frames (motion present, no frozen sheet)",
      avg > 1.5,
      JSON.stringify({ avgDelta: avg.toFixed(2) }),
    );
    ctx.check(
      "rhythm: motion is smooth (no popping — max step near the average, not a teleport)",
      max < avg * 2.4,
      JSON.stringify({ maxDelta: max.toFixed(2), avgDelta: avg.toFixed(2) }),
    );

    // A looping GIF for the eye (review artifact, not pixel-gated).
    const frames = buffers.map((b) => downscaleRGBA(pngToRGBA(b), 2));
    const gif = encodeGif(frames, frames[0].width, frames[0].height, 12);
    await mkdir(`${SHOTS_MISC}water/`, { recursive: true });
    await writeFile(`${SHOTS_MISC}water/rhythm.gif`, gif);
  } finally {
    await page.close();
  }
}
