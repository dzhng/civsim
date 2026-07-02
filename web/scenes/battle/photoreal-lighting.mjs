import { PNG } from 'pngjs';

// Slice 09 — lighting core: physical sun + IBL + ACES tonemap, all mapped from
// the ONE preset owner (CIVSIM_ENVIRONMENTS). Every battle environment preset
// renders /renderer/photoreal-battle at the SAME fixed setTime and framing;
// the ONE visual variable is how surfaces respond to sun + ambient, cropped to
// `crowd-mid` (center formations at mid zoom). Since 14a, the same scene also
// pins the soldier material identity under all four presets. Asserts: the stats
// identity maps each battle alias to its civsim preset, the crowd publishes its
// material channel mapping, fixed-time frames are byte-deterministic, and
// swapping the preset deterministically moves the pixels (same world, different
// environment — the aesthetics litmus).
export const meta = {
  name: 'battle-photoreal-lighting',
  kind: 'visual',
  world: 'battle-photoreal',
  tier: 'full',
  snapshots: [
    'photoreal-lighting/golden-hour-crowd-mid',
    'photoreal-lighting/noon-crowd-mid',
    'photoreal-lighting/dusk-crowd-mid',
    'photoreal-lighting/overcast-foggy-crowd-mid',
  ],
  describe: 'Photoreal lighting/material core: per-preset crowd-mid snapshots, deterministic preset swaps.',
};

const FIXED_TIME = 0;
// battle alias → the civsim preset id the stats identity must report.
const PRESETS = [
  { env: 'golden-hour', preset: 'golden' },
  { env: 'noon', preset: 'noon' },
  { env: 'dusk', preset: 'dusk' },
  { env: 'overcast-foggy', preset: 'overcast' },
];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('photoreal lighting requires browser GPU flags', true, 'set VERIFY_GPU=1');
    return;
  }
  const hardware = process.env.VERIFY_GPU_ADAPTER === 'hardware';
  const crops = new Map();

  for (const { env, preset } of PRESETS) {
    const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: env });
    await page.goto(
      `${ctx.target}/renderer/photoreal-battle?map=A&t=${FIXED_TIME}&ref=1&zoom=4.5&cx=0&cy=-650&env=${env}`,
    );
    await page.waitForFunction(
      () => window.__rendererLabReady === true && window.__rendererLabStats?.ok === true,
      undefined,
      { timeout: 180000 },
    );
    await page.waitForTimeout(400);
    const stats = await page.evaluate(() => window.__rendererLabStats);
    const material = stats?.stats?.renderStats?.crowd?.material;
    ctx.check(
      `${env}: identity maps through the ONE preset owner (${preset})`,
      stats?.environment === preset &&
        stats?.stats?.renderStats?.terrain?.environment?.source === `CIVSIM_ENVIRONMENTS.${preset}`,
      JSON.stringify({
        environment: stats?.environment,
        source: stats?.stats?.renderStats?.terrain?.environment?.source,
      }),
    );
    ctx.check(
      `${env}: crowd publishes the soldier material identity`,
      material?.identity === 'soldier-assets-placeholder-pbr-v1' &&
        material?.mapping?.orm === 'occlusion/roughness/metalness, canonical order from skinnedPipeline' &&
        material?.mapping?.factionMask === 'high-blue cColor accent channel' &&
        material?.pbr?.metalness?.iron > material?.pbr?.metalness?.bronze &&
        material?.pbr?.roughness?.linen > material?.pbr?.roughness?.leather,
      JSON.stringify(material),
    );

    // Clipped canvas shot (SwiftShader: a full frame is ~30 s of software
    // rasterization — no element-stability wait, long timeouts).
    const clip = await page.locator('#renderer-canvas').boundingBox();
    const shotA = await page.screenshot({ clip, timeout: 180000 });
    if (env === 'golden-hour') {
      const shotB = await page.screenshot({ clip, timeout: 180000 });
      ctx.check(
        'fixed setTime renders byte-identical frames under the physical lighting/materials',
        Buffer.compare(shotA, shotB) === 0,
        JSON.stringify({ bytesA: shotA.length, bytesB: shotB.length }),
      );
    }
    const crop = cropCrowdMid(PNG.sync.read(shotA));
    crops.set(env, crop);
    // Baselines are SwiftShader artifacts; a hardware run must not diff them.
    if (!hardware) await ctx.snap(page, `photoreal-lighting/${env}-crowd-mid`, { shot: PNG.sync.write(crop) });
    await page.close();
  }

  // Deterministic preset swap: same world, same clock, different environment
  // must MOVE the surfaces (light lives in the environment, not the albedo).
  const pairs = [
    ['golden-hour', 'overcast-foggy'],
    ['golden-hour', 'noon'],
    ['golden-hour', 'dusk'],
  ];
  for (const [a, b] of pairs) {
    const diff = meanAbsDiff(crops.get(a), crops.get(b));
    ctx.check(
      `preset swap ${a} → ${b} moves the surface response (mean|Δ| > 4)`,
      diff > 4,
      JSON.stringify({ meanAbsDiff: Number(diff.toFixed(2)) }),
    );
  }
}

// crowd-mid: the center-formation band at mid zoom — the slice's named crop.
function cropCrowdMid(png) {
  const w = Math.floor(png.width * 0.5);
  const h = Math.floor(png.height * 0.4);
  const x0 = Math.floor((png.width - w) / 2);
  const y0 = Math.floor(png.height * 0.3);
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, x0, y0, w, h, 0, 0);
  return out;
}

function meanAbsDiff(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum +=
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return sum / ((a.data.length / 4) * 3);
}
