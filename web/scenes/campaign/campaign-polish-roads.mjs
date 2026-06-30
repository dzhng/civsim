import { PNG } from 'pngjs';

// Campaign-polish workbench: the road-continuity fake scene.
// The `alignment` fixture is Roma with three roads radiating to Tibur, Narnia,
// and the coastal port Ostia/Portus. That layout isolates the two road defects
// the user reported on the real map before we touch it:
//   - assets/user-feedback/04-rome-south-road-cutoff.png : a road leaving Rome
//     vanishes before it reaches the next city.
//   - assets/user-feedback/01-rome-ostia-label-road.png  : the coastal
//     Ostia/Portus must keep BOTH its label and its road.
// Every road here must paint continuously from Roma to within the destination
// city's footprint, and Ostia/Portus must stay a visible label.
export const meta = {
  name: 'campaign-polish-roads',
  kind: 'visual',
  world: 'campaign-alignment',
  tier: 'quick',
  snapshots: ['polish-road-continuity'],
  describe: 'Fixture road-continuity workbench: Roma spokes to Tibur/Narnia/Ostia paint unbroken to each city, Ostia/Portus label kept.',
};

// Roma and its three spokes, copied from buildAlignmentCampaign in web/src/main.ts.
const ROMA = [-62, 18];
const SPOKES = [
  { name: 'Roma-Tibur', via: [[-62, 18], [-46, 19], [-28, 22]] },
  { name: 'Roma-Narnia', via: [[-62, 18], [-55, 34], [-42, 46]] },
  { name: 'Roma-Ostia/Portus', via: [[-62, 18], [-70, 5], [-76, -8]] },
];
// Frame Roma so all three destination cities sit on screen.
const CAMERA = [-52, 16, 8.0];

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('campaign polish roads workbench requires VERIFY_GPU=1', true, 'set VERIFY_GPU=1 to exercise the WebGPU campaign adapter');
    return;
  }

  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: 'campaign-polish-roads',
  });
  await page.goto(`${ctx.target}/?campaign=alignment`);
  await page.waitForFunction(
    () => window.__campaignReady === true
      && window.__campaignGpuStats?.ready === true
      && window.__campaignGpuStats?.renderer === 'renderer-campaign',
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate((camera) => {
    window.__campaign.freeze(true);
    // Natural view: roads and terrain are the thing under review, not the
    // political wash.
    window.__campaign.factionView(false);
    window.__campaign.fogOfWar(false);
    window.__campaign.select(-1);
    window.__campaign.cam(...camera);
  }, CAMERA);
  await page.waitForTimeout(320);

  const stats = await page.evaluate(() => window.__campaignGpuStats);
  ctx.check(
    'polish road workbench keeps Ostia/Portus a visible label',
    stats.visibleLabelNames?.includes('city:OSTIA/PORTUS') === true,
    JSON.stringify(stats.visibleLabelNames),
  );
  // Road life: deterministic carts ride the spokes at this close camera (frozen
  // scene time pins them to a fixed spot for the snapshot).
  ctx.check(
    'road life: at least one cart rides the Roma spokes',
    (stats.sceneryStats?.carts ?? 0) >= 1,
    JSON.stringify({ carts: stats.sceneryStats?.carts }),
  );

  // Densely resample each spoke, project to screen, and confirm a road pixel
  // lands near every sample from Roma all the way to the city footprint. A
  // gap-before-the-city (the reported cutoff) shows up as a low tail hit ratio.
  const projected = await page.evaluate(({ spokes, roma }) => {
    const resample = (via, stepKm) => {
      const pts = [];
      for (let i = 1; i < via.length; i++) {
        const [ax, ay] = via[i - 1];
        const [bx, by] = via[i];
        const len = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(len / stepKm));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
        }
      }
      return pts;
    };
    return spokes.map((spoke) => {
      const worldPts = resample(spoke.via, 2);
      const screen = worldPts.map(([x, y]) => {
        const [sx, sy] = window.__campaign.project(x, y);
        // distance (km) from the destination city = last via point
        const dest = spoke.via[spoke.via.length - 1];
        const distToDest = Math.hypot(x - dest[0], y - dest[1]);
        const distToRoma = Math.hypot(x - roma[0], y - roma[1]);
        return { sx, sy, distToDest, distToRoma };
      });
      return { name: spoke.name, screen };
    });
  }, { spokes: SPOKES, roma: ROMA });

  const image = PNG.sync.read(await page.screenshot());
  const continuity = projected.map((spoke) => roadContinuity(image, spoke));
  // The reported defect (img 04) is a road that drops out for a long run before
  // reaching its city. That reads as a big consecutive gap, so gate on the worst
  // gap (in ~2 km samples) rather than a brittle tail ratio: a few stray misses
  // where the ribbon passes under a model are fine, a multi-sample hole is not.
  ctx.check(
    'every Roma spoke paints unbroken from city to city (no mid-road cutoff)',
    continuity.every((c) => c.hitRatio >= 0.85 && c.maxGap <= 3 && c.reachesCity),
    JSON.stringify(continuity),
  );

  await ctx.snap(page, 'polish-road-continuity', { shot: PNG.sync.write(image) });
  await page.close();
}

// A road sample "hits" if any pixel within a small screen radius reads as the
// pale paved road color. Skip samples under the city footprint (within ~3 km of
// the node) — those sit beneath the city model, not the road ribbon.
function roadContinuity(image, spoke) {
  const offsets = roadSampleOffsets();
  let onScreen = 0;
  let hits = 0;
  let gap = 0;
  let maxGap = 0;
  let reachesCity = false;
  for (const p of spoke.screen) {
    if (p.distToRoma < 3) continue; // leaving Roma's footprint
    const underCity = p.distToDest < 3;
    if (p.sx < 0 || p.sy < 36 || p.sx >= image.width || p.sy >= image.height) continue;
    if (underCity) {
      reachesCity = true; // the spline's city end is on screen
      continue;
    }
    onScreen++;
    if (sampleRoad(image, p.sx, p.sy, offsets)) {
      hits++;
      gap = 0;
      // a road pixel within ~6 km of the city = the ribbon arrives at the city
      if (p.distToDest <= 6) reachesCity = true;
    } else {
      gap++;
      if (gap > maxGap) maxGap = gap;
    }
  }
  return {
    name: spoke.name,
    onScreen,
    hits,
    hitRatio: Number((hits / Math.max(1, onScreen)).toFixed(3)),
    maxGap,
    reachesCity,
  };
}

function sampleRoad(image, sx, sy, offsets) {
  for (const [dx, dy] of offsets) {
    const x = Math.round(sx + dx);
    const y = Math.round(sy + dy);
    if (x < 0 || y < 36 || x >= image.width || y >= image.height) continue;
    const i = (y * image.width + x) * 4;
    if (isRoadPixel(image.data[i], image.data[i + 1], image.data[i + 2])) return true;
  }
  return false;
}

function roadSampleOffsets() {
  const offsets = [[0, 0]];
  for (let radius = 2; radius <= 12; radius += 2) {
    offsets.push([radius, 0], [-radius, 0], [0, radius], [0, -radius]);
    offsets.push([radius, radius], [-radius, radius], [radius, -radius], [-radius, -radius]);
  }
  return offsets;
}

function isRoadPixel(r, g, b) {
  return r > 156 && g > 138 && b > 96 && Math.abs(r - g) < 72 && Math.abs(g - b) < 92;
}
