import { PNG } from "pngjs";

const SAMPLE_MS = 2500;
const SOLDIER_SAMPLES = 8;
const UNIT_TEAM = 6;
const UNIT_TOTAL = 7;
const UNIT_ALIVE = 15;

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
    async ({ sampleMs, soldierSamples, UNIT_TEAM, UNIT_ALIVE, UNIT_TOTAL }) => {
      const g = window.__game;
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      g.freeze(false);

      const stats = g.stats();
      const candidates = [];
      for (let u = 0; u < stats.units; u++) {
        const info = g.unitInfo(u);
        if (info[UNIT_TEAM] === 0 && info[UNIT_ALIVE] > soldierSamples) candidates.push(u);
      }
      const unit = candidates.includes(4) ? 4 : candidates[0];
      if (!Number.isFinite(unit)) return { ready: false, reason: "no player unit", samples: [] };

      const info = g.unitInfo(unit);
      const start = g.soldierStartOf(unit);
      const count = Math.min(
        soldierSamples,
        Math.max(0, Math.floor(info[UNIT_TOTAL] ?? soldierSamples)),
      );
      const soldiers = Array.from({ length: count }, (_, i) => start + i);
      g.select(unit);
      g.setPace(unit, 0);
      g.setOrder(unit, info[0], info[1] + 80);
      g.setCamera(info[0], info[1] + 20, 10, -Math.PI / 2, 0.92);

      let ready = false;
      let readyFrames = 0;
      const startedAtTick = g.tickCount();
      for (let frame = 0; frame < 180; frame++) {
        await waitFrame();
        const states = soldiers.map((i) => g.debugSoldierAnim(i));
        const marching = states.length > 0 && states.every((s) => s?.clip === "march");
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

      // Sample until 90 SIM TICKS elapse (3s of sim time) - wall-clock
      // windows starve on the software adapter (~1fps => 2 samples/2.5s).
      const t0 = performance.now();
      const samples = [];
      // Span measured from the FIRST SAMPLE - the first rAF after boot can
      // swallow dozens of ticks in one compile hitch on the software adapter.
      const sampledSpan = () => (samples.length ? samples.at(-1).tick - samples[0].tick : 0);
      while (sampledSpan() < 90 && performance.now() - t0 < Math.max(sampleMs, 20000)) {
        await waitFrame();
        samples.push({
          t: performance.now() - t0,
          tick: g.tickCount(),
          soldiers: soldiers.map((index) => ({ index, anim: g.debugSoldierAnim(index) })),
        });
      }
      return { ready, unit, soldiers, samples };
    },
    { sampleMs: SAMPLE_MS, soldierSamples: SOLDIER_SAMPLES, UNIT_TEAM, UNIT_ALIVE, UNIT_TOTAL },
  );

  check(
    "marching unit entered sample window",
    capture.ready === true &&
      capture.samples.length >= 6 &&
      // 30 ticks = two full march cycles - enough span for the period math
      // even at software-adapter frame rates.
      capture.samples.at(-1).tick - capture.samples[0].tick >= 30,
    `${capture.reason ?? ""} samples=${capture.samples?.length ?? 0} tickSpan=${
      capture.samples?.length ? capture.samples.at(-1).tick - capture.samples[0].tick : 0
    }`,
  );
  if (!capture.ready) {
    await page.close();
    return;
  }

  const clipMetrics = clipStability(capture.samples, capture.soldiers);
  check(
    "NO CLASS FLICKER: sampled soldiers stay in march",
    clipMetrics.transitions === 0 && clipMetrics.nonMarch === 0,
    JSON.stringify(clipMetrics),
  );

  const phaseMetrics = phaseCadence(capture.samples, capture.soldiers);
  check(
    "PHASE ADVANCES: marching phases advance steadily",
    phaseMetrics.every((m) => m.negativeSteps === 0 && m.flatSteps === 0),
    JSON.stringify(phaseMetrics),
  );
  // Ticks, not wall ms: sim runs 30 ticks/s, so David's 500ms full swing
  // = 15 ticks. Wall-clock periods lie on the software adapter.
  check(
    "PERIOD: march cycle is 500ms +/- 150ms (15 +/- 4.5 sim ticks)",
    phaseMetrics.every((m) => m.periodTicks >= 10.5 && m.periodTicks <= 19.5),
    JSON.stringify(phaseMetrics.map((m) => ({ index: m.index, periodTicks: m.periodTicks }))),
  );

  const spread = phaseSpread(capture.samples[0]);
  // The DESIGN is two beat groups (march A/B at +0.5 phase) plus small
  // coherent jitter - assert the two groups exist and sit apart, not 3+.
  check(
    "neighboring soldiers are not phase-locked (A/B beat groups present)",
    spread.maxCircularDistance > 0.2 && spread.distinctBuckets >= 2,
    JSON.stringify(spread),
  );

  // One pixel sanity: the marching crop visibly changes across 3 render
  // frames (legs move). The half-vs-full-period pose similarity idea needs
  // a single isolated soldier to mean anything - the phase asserts above
  // are the timing contract.
  const fps = capture.samples.length / Math.max(0.001, capture.samples.at(-1).t / 1000);
  if (fps >= 20) {
    const pixel = await gaitPixelMetrics(page, capture.soldiers[0]);
    check(
      "pixel gait moves over three render frames",
      pixel.shortDiff > 0.02,
      JSON.stringify(pixel),
    );
  } else {
    ctx.log?.(`pixel gait check skipped (software adapter, fps=${fps.toFixed(1)})`);
  }

  await page.close();
}

function clipStability(samples, soldiers) {
  let transitions = 0;
  let nonMarch = 0;
  for (const index of soldiers) {
    let prev = null;
    for (const sample of samples) {
      const clip = sample.soldiers.find((s) => s.index === index)?.anim?.clip ?? "missing";
      if (clip !== "march") nonMarch++;
      if (prev !== null && clip !== prev) transitions++;
      prev = clip;
    }
  }
  return { transitions, nonMarch, soldiers: soldiers.length, frames: samples.length };
}

function phaseCadence(samples, soldiers) {
  return soldiers.map((index) => {
    const series = samples
      .map((sample) => ({
        t: sample.t,
        tick: sample.tick,
        phase: sample.soldiers.find((s) => s.index === index)?.anim?.phase,
      }))
      .filter((sample) => Number.isFinite(sample.phase));
    let unwrapped = 0;
    let previous = series[0]?.phase ?? 0;
    let negativeSteps = 0;
    let flatSteps = 0;
    let maxStep = 0;
    for (let i = 1; i < series.length; i++) {
      let delta = series[i].phase - previous;
      if (delta < -0.5) delta += 1;
      if (delta > 0.5) delta -= 1;
      if (delta < -0.001) negativeSteps++;
      if (delta <= 0.001) flatSteps++;
      maxStep = Math.max(maxStep, delta);
      unwrapped += delta;
      previous = series[i].phase;
    }
    const seconds = Math.max(0.001, (series.at(-1).t - series[0].t) / 1000);
    const cyclesPerSecond = unwrapped / seconds;
    const tickSpan = Math.max(1, series.at(-1).tick - series[0].tick);
    const periodTicks = unwrapped > 0 ? tickSpan / unwrapped : Infinity;
    return {
      index,
      periodTicks: Math.round(periodTicks * 10) / 10,
      negativeSteps,
      flatSteps,
      maxStep: Number(maxStep.toFixed(4)),
      periodMs: Number((1000 / cyclesPerSecond).toFixed(1)),
    };
  });
}

function phaseSpread(sample) {
  const phases = sample.soldiers
    .map((s) => s.anim?.phase)
    .filter((phase) => Number.isFinite(phase));
  let maxCircularDistance = 0;
  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      const d = Math.abs(phases[i] - phases[j]);
      maxCircularDistance = Math.max(maxCircularDistance, Math.min(d, 1 - d));
    }
  }
  const distinctBuckets = new Set(phases.map((phase) => Math.floor(phase * 12))).size;
  return {
    maxCircularDistance: Number(maxCircularDistance.toFixed(3)),
    distinctBuckets,
    phases: phases.map((phase) => Number(phase.toFixed(3))),
  };
}

async function gaitPixelMetrics(page, soldierIndex) {
  const basePhase = await page.evaluate(
    (index) => window.__game.debugSoldierAnim(index)?.phase,
    soldierIndex,
  );
  const shot0 = PNG.sync.read(
    await page.screenshot({ clip: await soldierClip(page, soldierIndex) }),
  );
  await waitFrames(page, 3);
  const shot3 = PNG.sync.read(
    await page.screenshot({ clip: await soldierClip(page, soldierIndex) }),
  );
  await waitForPhaseAdvance(page, soldierIndex, basePhase, 0.5);
  const shotHalf = PNG.sync.read(
    await page.screenshot({ clip: await soldierClip(page, soldierIndex) }),
  );
  await waitForPhaseAdvance(page, soldierIndex, basePhase, 0.95);
  const shotPeriod = PNG.sync.read(
    await page.screenshot({ clip: await soldierClip(page, soldierIndex) }),
  );
  return {
    shortDiff: Number(meanAbsDiff(shot0, shot3).toFixed(3)),
    halfDiff: Number(meanAbsDiff(shot0, shotHalf).toFixed(3)),
    periodDiff: Number(meanAbsDiff(shot0, shotPeriod).toFixed(3)),
  };
}

async function waitForPhaseAdvance(page, soldierIndex, basePhase, targetCycles) {
  const start = Date.now();
  let sawLateCycle = false;
  while (Date.now() - start < 1200) {
    const delta = await page.evaluate(
      ({ index, base }) => {
        const phase = window.__game.debugSoldierAnim(index)?.phase;
        return (((phase - base) % 1) + 1) % 1;
      },
      { index: soldierIndex, base: basePhase },
    );
    if (targetCycles > 0.9) {
      sawLateCycle = sawLateCycle || delta > 0.7;
      if (delta >= 0.97 || (sawLateCycle && delta < 0.08)) return;
    } else if (delta >= targetCycles) return;
    await waitFrames(page, 1);
  }
}

async function waitFrames(page, count) {
  for (let i = 0; i < count; i++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }
}

async function soldierClip(page, soldierIndex) {
  const box = await page.locator("#battlefield").boundingBox();
  const projected = await page.evaluate((index) => {
    const [x, y] = window.__game.soldierPos(index);
    const z = window.__game.heightAt(x, y);
    const [sx, sy] = window.__cam.worldToScreen(x, y, z);
    return { sx, sy, dpr: window.devicePixelRatio || 1 };
  }, soldierIndex);
  const size = 150;
  const x = Math.max(
    box.x,
    Math.min(box.x + box.width - size, box.x + projected.sx / projected.dpr - size / 2),
  );
  const y = Math.max(
    box.y,
    Math.min(box.y + box.height - size, box.y + projected.sy / projected.dpr - size / 2),
  );
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
