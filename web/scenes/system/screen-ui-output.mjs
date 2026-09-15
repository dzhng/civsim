import { PNG } from "pngjs";

// Compare authored UI colors through the screen phase, the old graded path, and
// the bare graded world. All three use the same world; pixels outside the
// swatches must match the bare world exactly, and translucent swatches must be
// the source-alpha blend of their authored ink over it.
export const meta = {
  name: "screen-ui-output",
  kind: "flow",
  world: "renderer-lab-screen-ui-output",
  tier: "full",
  snapshots: ["screen-ui-output", "screen-ui-world-control"],
  describe:
    "Ungraded screen-space UI reaches the canvas at its authored colour and blends by alpha, while the graded world stays pixel-identical.",
};

const FIXED_TIME = 0;
/** The campaign brightness gate's own white test, applied to the label ink. */
const LABEL_GATE = (p) => p.r > 205 && p.g > 205 && p.b > 185;
/** Swatch centres are interior, so no MSAA edge can reach them; 1 level of
 *  slack covers 8-bit rounding of the working-space round trip only. */
const EXACT = 1;
/** Blended swatches add one more 8-bit quantisation (the blend reads the
 *  background byte and writes the result byte), so they carry one more level. */
const BLEND_EXACT = 2;
/** Pixels within this many pixels of a swatch are "UI influence" and excluded
 *  from the unchanged-world comparison (blend edges, MSAA resolve). */
const INFLUENCE_PAD = 2;

/** One page at a time: two pages booting WebGPU together starve the second
 *  page's readiness under SwiftShader. */
async function openMode(ctx, mode, extraShots = 0) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: mode });
  await page.goto(`${ctx.target}/renderer/screen-ui-output?ui=${mode}&t=${FIXED_TIME}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.route === "screen-ui-output" &&
      window.__rendererLabStats?.stats?.drawCalls > 0,
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(300);
  const stats = await page.evaluate(() => window.__rendererLabStats.stats);
  const clip = await page.locator("#renderer-canvas").boundingBox();
  const shot = await page.screenshot({ clip, timeout: 120000 });
  const repeats = [];
  for (let i = 0; i < extraShots; i++) {
    await page.evaluate(() => window.__screenUiProofRedraw());
    repeats.push(await page.screenshot({ clip, timeout: 120000 }));
  }
  await page.close();
  return { page, stats, clip, shot, repeats, png: PNG.sync.read(shot) };
}

function pixelAt(png, x, y) {
  const i = (Math.round(y) * png.width + Math.round(x)) * 4;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3] };
}

function swatchCentre(png, rect) {
  return pixelAt(png, rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function channelError(pixel, srgb) {
  return Math.max(
    Math.abs(pixel.r - srgb[0]),
    Math.abs(pixel.g - srgb[1]),
    Math.abs(pixel.b - srgb[2]),
  );
}

/** Source-alpha over: the UI writes display-encoded ink into the same graded
 *  attachment the world wrote, so the arithmetic is on the sRGB bytes. */
function blendOver(srgb, alpha, background) {
  const over = (ink, under) => Math.round(ink * alpha + under * (1 - alpha));
  return [over(srgb[0], background.r), over(srgb[1], background.g), over(srgb[2], background.b)];
}

/** Differing pixels between two frames, ignoring everything the UI can touch. */
function worldDifference(a, b, rects) {
  const masked = new Set();
  for (const rect of rects)
    for (let y = rect.y - INFLUENCE_PAD; y < rect.y + rect.height + INFLUENCE_PAD; y++)
      for (let x = rect.x - INFLUENCE_PAD; x < rect.x + rect.width + INFLUENCE_PAD; x++)
        masked.add(y * a.width + x);
  let differing = 0;
  let compared = 0;
  let maxChannel = 0;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      if (masked.has(y * a.width + x)) continue;
      compared++;
      const i = (y * a.width + x) * 4;
      let delta = 0;
      for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[i + c] - b.data[i + c]));
      if (delta > 0) differing++;
      maxChannel = Math.max(maxChannel, delta);
    }
  return { compared, differing, maxChannel };
}

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("screen-ui-output requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const screen = await openMode(ctx, "screen", 1);
  const [repeat] = screen.repeats;
  const control = await openMode(ctx, "world");
  const background = await openMode(ctx, "none");

  const rects = screen.stats.swatches;
  const opaque = rects.filter((rect) => rect.alpha === 1);
  const translucent = rects.filter((rect) => rect.alpha < 1);

  ctx.check(
    "the three runs frame the same canvas and the same swatch rects",
    [control, background].every(
      (other) =>
        other.png.width === screen.png.width &&
        other.png.height === screen.png.height &&
        JSON.stringify(other.stats.swatches) === JSON.stringify(rects),
    ) && translucent.length > 0,
    JSON.stringify({ width: screen.png.width, height: screen.png.height, rects }),
  );

  ctx.check(
    "the screen phase reports the ungraded, depth-free, fog-free identity",
    screen.stats.screenUi?.owner === "screenUiPhase" &&
      screen.stats.screenUi?.drawn === 1 &&
      screen.stats.screenUi?.toneMapped === false &&
      screen.stats.screenUi?.depth === "none" &&
      screen.stats.screenUi?.fog === "none" &&
      control.stats.screenUi?.drawn === 0 &&
      background.stats.screenUi?.drawn === 0,
    JSON.stringify({
      screen: screen.stats.screenUi,
      control: control.stats.screenUi,
      background: background.stats.screenUi,
    }),
  );

  // --- the mechanism: authored ink survives the output phase ----------------
  const measured = opaque.map((rect) => ({
    name: rect.name,
    srgb: rect.srgb,
    screen: swatchCentre(screen.png, rect),
    control: swatchCentre(control.png, rect),
  }));
  ctx.check(
    "ungraded opaque screen UI reaches the canvas at its authored sRGB",
    measured.every((m) => channelError(m.screen, m.srgb) <= EXACT),
    JSON.stringify(measured.map((m) => ({ name: m.name, error: channelError(m.screen, m.srgb) }))),
  );
  ctx.check(
    "the graded control reproduces the failure the campaign labels hit",
    measured.every((m) => channelError(m.control, m.srgb) > EXACT) &&
      !LABEL_GATE(measured[0].control) &&
      LABEL_GATE(measured[0].screen),
    JSON.stringify(measured),
  );

  // --- the mechanism: translucent ink blends over the captured world --------
  const blended = translucent.map((rect) => {
    const under = swatchCentre(background.png, rect);
    const expected = blendOver(rect.srgb, rect.alpha, under);
    const got = swatchCentre(screen.png, rect);
    return {
      name: rect.name,
      alpha: rect.alpha,
      under,
      expected,
      got,
      error: channelError(got, expected),
      fromInk: channelError(got, rect.srgb),
      fromBackground: channelError(got, [under.r, under.g, under.b]),
    };
  });
  ctx.check(
    "translucent screen UI blends over the graded world by its source alpha",
    blended.every((b) => b.error <= BLEND_EXACT) &&
      // A swatch that matched its ink would prove alpha was dropped, and one
      // that matched the background would prove nothing was drawn at all.
      blended.every((b) => b.fromInk > EXACT && b.fromBackground > EXACT),
    JSON.stringify(blended),
  );

  // --- the world is untouched ----------------------------------------------
  const difference = worldDifference(screen.png, background.png, rects);
  ctx.check(
    "the world outside UI influence is pixel-identical with and without the screen phase",
    difference.differing === 0 && difference.compared > screen.png.width * screen.png.height * 0.5,
    JSON.stringify(difference),
  );
  // The phase's own bounded cost: the UI members' draw plus exactly one copy of
  // the shared display attachment to the canvas. The in-world control adds only
  // its own mesh, so it is the yardstick for "one extra draw".
  ctx.check(
    "the screen phase costs one member draw plus one display copy",
    screen.stats.drawCalls === background.stats.drawCalls + 2 &&
      control.stats.drawCalls === background.stats.drawCalls + 1 &&
      screen.stats.screenUi?.display?.copyDraws === 1 &&
      screen.stats.screenUi?.display?.samples === 0 &&
      screen.stats.screenUi?.display?.width === screen.png.width &&
      screen.stats.screenUi?.display?.height === screen.png.height &&
      background.stats.screenUi?.display === null,
    JSON.stringify({
      screen: screen.stats.drawCalls,
      control: control.stats.drawCalls,
      background: background.stats.drawCalls,
      display: screen.stats.screenUi?.display,
    }),
  );

  // --- determinism ----------------------------------------------------------
  await ctx.snap(screen.page, "screen-ui-output", {
    shot: screen.shot,
    threshold: 0,
    maxDiffRatio: 0,
  });
  await ctx.snap(control.page, "screen-ui-world-control", {
    shot: control.shot,
    threshold: 0,
    maxDiffRatio: 0,
  });
  await ctx.snap(screen.page, "screen-ui-output", {
    shot: repeat,
    threshold: 0,
    maxDiffRatio: 0,
  });
  ctx.check(
    "a fixed setTime renders identical pixels through the screen phase",
    Buffer.compare(screen.png.data, PNG.sync.read(repeat).data) === 0,
    JSON.stringify({ bytes: screen.shot.length, repeat: repeat.length }),
  );
}
