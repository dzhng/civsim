import { PNG } from "pngjs";
import { UNIT_INFO } from "../../../packages/game-renderer/src/battle/unitInfoLayout.ts";
import { APPEARANCE_DESCRIPTORS } from "../../../packages/soldier-assets/src/appearance.ts";

const SOLDIER_SAMPLES = 8;

export const meta = {
  name: "battle-anim-gait",
  kind: "flow",
  world: "battle-gen-seed-7",
  tier: "quick",
  snapshots: [],
  describe: "BMSANIM-E2C7: marching soldiers keep class, phase, cadence, and visible gait motion.",
};

export async function run(ctx) {
  const { check } = ctx;
  const page = await ctx.newPage();
  await page.goto(`${ctx.target}/?map=gen&seed=7&ai=off`);
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });

  const capture = await page.evaluate(
    async ({ soldierSamples, unitInfo, variants }) => {
      const g = window.__game;
      g.freeze(true);
      const step = async () => {
        g.advance(1);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      };

      const stats = g.stats();
      const candidates = [];
      for (let u = 0; u < stats.units; u++) {
        const info = g.unitInfo(u);
        if (info[unitInfo.team] === 0 && info[unitInfo.alive] > soldierSamples) candidates.push(u);
      }
      const unit = candidates.includes(4) ? 4 : candidates[0];
      if (!Number.isFinite(unit)) return { ready: false, reason: "no player unit", samples: [] };

      const info = g.unitInfo(unit);
      const start = g.soldierStartOf(unit);
      const count = Math.min(
        soldierSamples,
        Math.max(0, Math.floor(info[unitInfo.total] ?? soldierSamples)),
      );
      const soldiers = Array.from({ length: count }, (_, i) => start + i);
      const catalogUrl = new URL("/assets/soldiers/catalog.json", location.href);
      const catalog = await (await fetch(catalogUrl)).json();
      const walks = {};
      // Catalog-relative manifests own clip names and physical stride calibration.
      for (const { appearanceId: id } of variants.filter(
        (variant) => variant.unitClass === info[unitInfo.classId],
      )) {
        const path = catalog.appearances[id];
        const manifestUrl = new URL(path, catalogUrl);
        const manifest = await (await fetch(manifestUrl)).json();
        const animation = await (await fetch(new URL(manifest.animation, manifestUrl))).json();
        const clip = animation.clips.find(
          (clip) => clip.name === manifest.presentation.actions.walk.clip,
        );
        if (!clip?.loop || !(clip.strideMeters > 0)) throw new Error(`Uncalibrated walk for ${id}`);
        walks[id] = { clip: clip.name, strideMeters: clip.strideMeters };
      }
      const sample = (index) => {
        const anim = g.debugSoldierAnim(index);
        return {
          index,
          anim,
          motorPath: g.soldierMotorPath(index),
          walk: walks[anim?.playback?.appearanceId],
        };
      };
      g.select(unit);
      g.setPace(unit, 0);
      g.setOrder(unit, info[unitInfo.x], info[unitInfo.y] + 80);
      const [x, y] = g.soldierPos(soldiers[0]);
      g.reviewFrame(x - 8, y - 8, x + 8, y + 8, { margin: 4, pitch: 1.1, fill: 0.6 });

      let ready = false;
      let readyFrames = 0;
      const startedAtTick = g.tickCount();
      // At most 180 simulation ticks of pre-roll, independent of GPU throughput.
      for (let tick = 0; tick < 180; tick++) {
        await step();
        const states = soldiers.map(sample);
        const marching =
          states.length > 0 && states.every((s) => s.walk && s.anim?.clip === s.walk.clip);
        readyFrames = marching ? readyFrames + 1 : 0;
        if (readyFrames >= 3 && g.tickCount() > startedAtTick + 4) {
          ready = true;
          break;
        }
      }
      if (!ready) {
        return {
          ready,
          reason: "soldiers did not enter a stable march pre-roll",
          unit,
          soldiers,
          samples: [],
        };
      }

      // Sample every submitted simulation tick, including transient clip changes.
      // GPU readback settling is needed only for the pixel check below.
      const samples = [];
      for (let offset = 0; offset <= 90; offset++) {
        if (offset > 0) await step();
        samples.push({
          tick: g.tickCount(),
          soldiers: soldiers.map(sample),
        });
      }
      return { ready, unit, soldiers, samples };
    },
    {
      soldierSamples: SOLDIER_SAMPLES,
      unitInfo: UNIT_INFO,
      variants: APPEARANCE_DESCRIPTORS.map(({ selection }, appearanceId) => ({
        appearanceId,
        ...selection,
      })),
    },
  );

  check(
    "marching unit entered sample window",
    capture.ready === true &&
      capture.samples.length >= 6 &&
      capture.samples.at(-1).tick - capture.samples[0].tick >= 90,
    `${capture.reason ?? ""} samples=${capture.samples?.length ?? 0} tickSpan=${
      capture.samples?.length ? capture.samples.at(-1).tick - capture.samples[0].tick : 0
    }`,
  );
  if (!capture.ready) {
    await page.close();
    return;
  }

  check(
    "sampling includes every consecutive simulation tick",
    capture.samples.every(
      (sample, index) => index === 0 || sample.tick === capture.samples[index - 1].tick + 1,
    ),
    JSON.stringify({ samples: capture.samples.length }),
  );
  const validSamples = capture.samples.every((sample) =>
    sample.soldiers.every(
      ({ anim, walk, motorPath }) =>
        Number.isFinite(anim?.phase) &&
        anim.phase >= 0 &&
        anim.phase < 1 &&
        Number.isFinite(anim.duration) &&
        anim.duration > 0 &&
        Number.isFinite(motorPath) &&
        walk?.strideMeters > 0,
    ),
  );
  check("gait samples have finite loop phases and positive authored duration", validSamples);
  if (!validSamples) {
    await page.close();
    return;
  }

  const clipMetrics = clipStability(capture.samples, capture.soldiers);
  check(
    "NO CLASS FLICKER: sampled soldiers stay in march",
    clipMetrics.transitions === 0 &&
      clipMetrics.nonMarch === 0 &&
      clipMetrics.appearanceChanges === 0,
    JSON.stringify(clipMetrics),
  );

  const phaseMetrics = phaseCadence(capture.samples, capture.soldiers);
  check(
    "PHASE ADVANCES: marching phases advance steadily",
    phaseMetrics.every((m) => m.actualCycles > 0 && m.negativeSteps === 0),
    JSON.stringify(phaseMetrics),
  );
  // Explicit freeze samples the current engine endpoint, not the delayed live fraction.
  // Motor path is the engine-qualified counter, never inferred from transport or a timer.
  check(
    "DISTANCE: each walking phase increment follows motor path / authored stride",
    phaseMetrics.every((m) => m.maxCycleError <= 1e-6),
    JSON.stringify(phaseMetrics),
  );

  // Scene-motion sanity, not isolated articulation: translation and neighbors
  // also contribute pixels. Evaluated-pose fidelity belongs to the pose fixture.
  const pixel = await gaitPixelMetrics(page, capture.soldiers[0]);
  check(
    "on-screen marching scene moves over three simulation ticks",
    pixel.shortDiff > 0.02,
    JSON.stringify(pixel),
  );

  await page.close();
}

export function clipStability(samples, soldiers) {
  let transitions = 0;
  let nonMarch = 0;
  let appearanceChanges = 0;
  for (const index of soldiers) {
    let prev = null;
    let appearance = null;
    for (const sample of samples) {
      const row = sample.soldiers.find((s) => s.index === index);
      const clip = row?.anim?.clip ?? "missing";
      if (clip !== row?.walk?.clip) nonMarch++;
      if (prev !== null && clip !== prev) transitions++;
      const next = row?.anim?.playback?.appearanceId;
      if (appearance !== null && next !== appearance) appearanceChanges++;
      appearance = next;
      prev = clip;
    }
  }
  return {
    transitions,
    nonMarch,
    appearanceChanges,
    soldiers: soldiers.length,
    frames: samples.length,
  };
}

export function phaseCadence(samples, soldiers) {
  return soldiers.map((index) => {
    const series = samples
      .map((sample) => ({
        tick: sample.tick,
        phase: sample.soldiers.find((s) => s.index === index)?.anim?.phase,
        motorPath: sample.soldiers.find((s) => s.index === index)?.motorPath,
        stride: sample.soldiers.find((s) => s.index === index)?.walk?.strideMeters,
      }))
      .filter((sample) => Number.isFinite(sample.phase));
    let unwrapped = 0;
    let previous = series[0]?.phase ?? 0;
    let negativeSteps = 0;
    let expectedCycles = 0;
    let maxCycleError = 0;
    for (let i = 1; i < series.length; i++) {
      let delta = series[i].phase - previous;
      const expected = (series[i].motorPath - series[i - 1].motorPath) / series[i].stride;
      delta += Math.round(expected - delta);
      if (delta < -0.001) negativeSteps++;
      expectedCycles += expected;
      maxCycleError = Math.max(maxCycleError, Math.abs(delta - expected));
      unwrapped += delta;
      previous = series[i].phase;
    }
    return {
      index,
      actualCycles: unwrapped,
      expectedCycles,
      negativeSteps,
      maxCycleError,
    };
  });
}

async function gaitPixelMetrics(page, soldierIndex) {
  await page.evaluate(async (index) => {
    const game = window.__game;
    const [x, y] = game.soldierPos(index);
    game.reviewFrame(x - 8, y - 8, x + 8, y + 8, { margin: 4, pitch: 1.1, fill: 0.6 });
    await game.freezeAtTick(game.tickCount());
  }, soldierIndex);
  const shot0 = PNG.sync.read(
    await page.screenshot({ clip: await soldierClip(page, soldierIndex) }),
  );
  await page.evaluate(async () => {
    const game = window.__game;
    await game.freezeAtTick(game.tickCount() + 3);
  });
  const shot3 = PNG.sync.read(
    await page.screenshot({ clip: await soldierClip(page, soldierIndex) }),
  );
  return { shortDiff: Number(meanAbsDiff(shot0, shot3).toFixed(3)) };
}

async function soldierClip(page, soldierIndex) {
  const box = await page.locator("#battlefield").boundingBox();
  const projected = await page.evaluate((index) => {
    const [x, y] = window.__game.soldierPos(index);
    const z = window.__game.heightAt(x, y);
    // A generous three-meter vertical envelope includes this foot soldier's
    // body and weapon. Reject invalid projection instead of cropping empty sky.
    const foot = window.__cam.worldToScreen(x, y, z);
    const head = window.__cam.worldToScreen(x, y, z + 3);
    return { foot, head, dpr: window.devicePixelRatio || 1 };
  }, soldierIndex);
  const size = 150;
  const points = [projected.foot, projected.head].map(([x, y]) => [
    x / projected.dpr,
    y / projected.dpr,
  ]);
  if (
    points.some(
      ([x, y]) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        y < 0 ||
        x > box.width ||
        y > box.height,
    )
  )
    throw new Error("Gait pixel target is outside the viewport: " + JSON.stringify(projected));
  const x = box.x + (points[0][0] + points[1][0]) / 2 - size / 2;
  const y = box.y + (points[0][1] + points[1][1]) / 2 - size / 2;
  if (
    x < box.x ||
    y < box.y ||
    x + size > box.x + box.width ||
    y + size > box.y + box.height ||
    points.some(
      ([px, py]) =>
        px + box.x < x || px + box.x > x + size || py + box.y < y || py + box.y > y + size,
    )
  )
    throw new Error("Gait pixel target is not fully framed by its crop");
  return { x, y, width: size, height: size };
}

function meanAbsDiff(a, b) {
  const n = Math.min(a.data.length, b.data.length);
  let sum = 0;
  for (let i = 0; i < n; i += 4) {
    sum +=
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return sum / Math.max(1, (n / 4) * 3);
}
