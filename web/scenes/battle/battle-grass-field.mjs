import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

export const meta = {
  name: "battle-grass-field",
  kind: "visual",
  world: "battle-grass-field",
  tier: "full",
  snapshots: [
    "grass/field-packed-tilt",
    "grass/field-meadow-material",
    "grass/field-blade-accents",
    "grass/foreground-close-lab",
    "grass/foreground-close-lab-crops",
    "grass/foreground-close-lab-rejected-families",
    "grass/foreground-close-lab-scale-repair-candidates",
    "grass/foreground-close-lab-scale-repair-selected",
    "grass/foreground-close-lab-scale-repair-crops",
    "grass/foreground-close-lab-test-environment",
    "grass/foreground-close-lab-test-environment-baselines",
    "grass/foreground-close-lab-test-environment-crops",
    "grass/foreground-close-lab-body-architecture-candidates",
    "grass/foreground-close-lab-body-architecture-crops",
    "grass/foreground-close-lab-body-architecture-selected",
    "grass/foreground-close-lab-body-continuity-candidates",
    "grass/foreground-close-lab-body-continuity-crops",
    "grass/foreground-close-lab-body-continuity-selected",
    "grass/foreground-close-lab-body-alpha-model-candidates",
    "grass/foreground-close-lab-body-alpha-model-crops",
    "grass/foreground-close-lab-body-alpha-model-selected",
  ],
  describe:
    "Grass-field route proving packed terrain-normal attributes, field-driven meadow material, and bounded blade accents.",
};

const CLOSE_LAB_VARIANTS = [
  "field-fiber-shell",
  "texture-volume",
  "texture-carrier",
  "texture-micro-carrier",
];
const BODY_ARCHITECTURE_CANDIDATES = [
  {
    family: "field-fiber-shell",
    label: "FIELD SHELL CONTROL",
    color: [66, 103, 48, 255],
    artifact: "smooth flat shell",
  },
  {
    family: "alpha-impostor",
    label: "ALPHA IMPOSTOR",
    color: [96, 96, 52, 255],
    artifact: "decal patch",
  },
  {
    family: "billboard-cluster",
    label: "BILLBOARD CLUSTER",
    color: [76, 111, 92, 255],
    artifact: "card cluster",
  },
  { family: "volume-card", label: "VOLUME CARD", color: [93, 83, 121, 255], artifact: "card wall" },
  {
    family: "texture-volume",
    label: "TEXTURE VOLUME",
    color: [92, 83, 46, 255],
    artifact: "texture stamp",
  },
  {
    family: "texture-carrier",
    label: "TEXTURE CARRIER",
    color: [142, 92, 44, 255],
    artifact: "straw wires",
  },
  {
    family: "texture-micro-carrier",
    label: "MICRO CARRIER",
    color: [75, 78, 118, 255],
    artifact: "pixel grit",
  },
];
const BODY_CONTINUITY_REPAIR_CANDIDATES = [
  {
    profile: "current",
    label: "REJECTED CURRENT",
    color: [92, 83, 46, 255],
    artifact: "curtain islands",
  },
  {
    profile: "seated-soft",
    label: "SEATED SOFT",
    color: [82, 119, 64, 255],
    artifact: "seated roots",
  },
  {
    profile: "overlap-stagger",
    label: "OVERLAP STAGGER",
    color: [62, 112, 122, 255],
    artifact: "staggered sheets",
    selected: true,
  },
  {
    profile: "broken-lattice",
    label: "BROKEN LATTICE",
    color: [120, 90, 142, 255],
    artifact: "fine lattice",
  },
];
const BODY_ALPHA_RENDER_MODEL_CANDIDATES = [
  {
    renderModel: "opaque-card",
    label: "OPAQUE CARD",
    color: [92, 83, 46, 255],
    artifact: "opaque card base",
  },
  {
    renderModel: "alpha-cutout",
    label: "ALPHA CUTOUT",
    color: [78, 116, 62, 255],
    artifact: "strict texel cutout",
  },
  {
    renderModel: "hard-cutout",
    label: "HARD CUTOUT",
    color: [116, 112, 55, 255],
    artifact: "high-threshold cutout",
  },
  {
    renderModel: "dither-cutout",
    label: "DITHER CUTOUT",
    color: [62, 112, 122, 255],
    artifact: "deterministic soft cutout",
  },
  {
    renderModel: "sparse-dither",
    label: "SPARSE DITHER",
    color: [112, 82, 140, 255],
    artifact: "high-threshold dither",
    selected: true,
  },
];
const SCALE_REPAIR_CANDIDATES = [
  { profile: "b4b1-current", color: [88, 88, 88, 255] },
  { profile: "scale-repair-low", color: [60, 116, 62, 255], selected: true },
  { profile: "scale-repair-oblique", color: [54, 88, 154, 255] },
];
const TEST_ENVIRONMENT_CANDIDATES = [
  { profile: "b4b1-current", color: [88, 88, 88, 255] },
  { profile: "scale-repair-low", color: [60, 116, 62, 255] },
  { profile: "b4b1a0-test-env", color: [168, 86, 42, 255], selected: true },
];
const TARGET_CLOSE_HERO = new URL(
  "../../../specs/battle-map-reference/assets/03b4-evidence/03b4c5-close-foreground-lab/target-crop-contract/target/close-hero.png",
  import.meta.url,
);

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "packed grass field shot requires browser GPU flags",
      true,
      "set VERIFY_GPU=1 to capture",
    );
    return;
  }

  await verifyPackedTilt(ctx);
  await verifyFieldMeadow(ctx);
  await verifyFieldAccent(ctx);
  await verifyForegroundCloseLab(ctx);
  await verifyForegroundCloseLabScaleRepair(ctx);
  await verifyForegroundCloseLabTestEnvironment(ctx);
  await verifyForegroundCloseBodyArchitectureMatrix(ctx);
  await verifyForegroundCloseBodyContinuityRepair(ctx);
  await verifyForegroundCloseBodyAlphaRenderModel(ctx);
}

async function verifyPackedTilt(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-grass-field",
  });
  await page.goto(`${ctx.target}/renderer/battle-grass-field?mode=packed-tilt`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.mode === "packed-tilt",
    { timeout: 18000 },
  );
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== "battle-grass-field" || stats?.mode !== "packed-tilt") {
    await page.close();
    throw new Error(`battle grass field did not publish valid stats: ${JSON.stringify(stats)}`);
  }

  ctx.check(
    "packed field route publishes slope/stride telemetry",
    hasPackedTelemetry(stats),
    JSON.stringify(stats.grass),
  );
  ctx.check(
    "packed field stays in world-depth phase",
    hasPackedWorldDepthPass(stats.framePhases),
    JSON.stringify(stats.framePhases),
  );
  const shot = await page.locator("#renderer-canvas").screenshot();
  const png = PNG.sync.read(shot);
  const metrics = packedGrassMetrics(png);
  ctx.check(
    "packed field screenshot shows grass on rolling ground and a clear steep ramp",
    metrics.grassField.edge > 0.015 &&
      metrics.steepRamp.edge < 0.006 &&
      metrics.grassField.cover > 0.9,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, "grass/field-packed-tilt", { shot });
  await page.close();
}

async function verifyFieldMeadow(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-grass-field-meadow",
  });
  await page.goto(`${ctx.target}/renderer/battle-grass-field?mode=field-meadow`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.mode === "field-meadow",
    { timeout: 18000 },
  );
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== "battle-grass-field" || stats?.mode !== "field-meadow") {
    await page.close();
    throw new Error(`battle grass meadow did not publish valid stats: ${JSON.stringify(stats)}`);
  }

  ctx.check(
    "field meadow route publishes field-owned material telemetry",
    hasFieldMeadowTelemetry(stats),
    JSON.stringify({ meadow: stats.ground?.meadow, grass: stats.grass }),
  );
  ctx.check(
    "field meadow keeps foreground blade geometry out of the meadow-material crop",
    stats.grass?.bladeInstances === 0 && stats.grass?.drawCalls === 0,
    JSON.stringify(stats.grass),
  );
  ctx.check(
    "field meadow keeps soft root-mass accent layer disabled",
    stats.ground?.meadow?.rootMassEnabled === false,
    JSON.stringify(stats.ground?.meadow),
  );
  const shot = await page.locator("#renderer-canvas").screenshot();
  const png = PNG.sync.read(shot);
  const metrics = fieldMeadowMetrics(png);
  ctx.check(
    "field meadow screenshot shows continuous green meadow mass without blade-count edge noise",
    metrics.meadow.greenRatio > 0.34 &&
      metrics.meadow.softEdge > 0.0015 &&
      metrics.meadow.softEdge < 0.004 &&
      metrics.meadow.edge < 0.014 &&
      metrics.steepRamp.edge < 0.006,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, "grass/field-meadow-material", { shot });
  await page.close();
}

async function verifyFieldAccent(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "battle-grass-field-accent",
  });
  await page.goto(`${ctx.target}/renderer/battle-grass-field?mode=field-accent`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true &&
      window.__rendererLabStats?.stats?.mode === "field-accent",
    { timeout: 18000 },
  );
  await page.waitForTimeout(160);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  if (stats?.route !== "battle-grass-field" || stats?.mode !== "field-accent") {
    await page.close();
    throw new Error(`battle grass accent did not publish valid stats: ${JSON.stringify(stats)}`);
  }

  ctx.check(
    "field accent route keeps meadow material as field-owned mass",
    hasFieldMeadowTelemetry(stats),
    JSON.stringify({ meadow: stats.ground?.meadow, grass: stats.grass }),
  );
  ctx.check(
    "field accent route uses field-owned foreground fiber shell geometry",
    stats.grass?.accentTufts > 20 &&
      stats.grass?.accentTufts < stats.grass?.fieldRecords &&
      stats.grass?.accentStyle === "field-fiber-shell" &&
      stats.grass?.accentAggregation === "field-near" &&
      stats.grass?.fiberShellVariant === "normal" &&
      stats.grass?.accentClumps === 0 &&
      stats.grass?.accentSourceRecords > stats.grass?.accentTufts &&
      stats.grass?.fiberShellSourceRecords === stats.grass?.accentSourceRecords &&
      stats.grass?.fiberShellRecords === stats.grass?.accentTufts &&
      stats.grass?.fiberShellRibbons === stats.grass?.accentRibbons &&
      stats.grass?.fiberShellRibbons >= stats.grass?.fiberShellRecords &&
      stats.grass?.fiberShellDepthFar > stats.grass?.fiberShellDepthNear &&
      stats.grass?.fiberShellSubmittedTriangles === stats.grass?.submittedTriangles &&
      stats.grass?.tuftInstances === stats.grass?.accentTufts &&
      stats.grass?.bladeInstances >= stats.grass?.tuftInstances &&
      stats.grass?.drawCalls === 1,
    JSON.stringify(stats.grass),
  );
  ctx.check(
    "field accent route enables soft root-mass field material",
    stats.ground?.meadow?.rootMassEnabled === true &&
      stats.ground?.meadow?.rootMassStrength > 0 &&
      stats.ground?.meadow?.rootMassCoverage > 0.05 &&
      stats.ground?.meadow?.rootMassAvg > 0.02,
    JSON.stringify(stats.ground?.meadow),
  );
  const shot = await page.locator("#renderer-canvas").screenshot();
  const png = PNG.sync.read(shot);
  const metrics = fieldMeadowMetrics(png);
  ctx.check(
    "field accent screenshot adds near-field structure without becoming a noisy all-over card layer",
    metrics.meadow.greenRatio > 0.34 &&
      metrics.meadow.softEdge > 0.002 &&
      metrics.meadow.edge < 0.04 &&
      metrics.steepRamp.edge < 0.012,
    JSON.stringify(metrics),
  );
  await ctx.snap(page, "grass/field-blade-accents", { shot });
  await page.close();
}

async function verifyForegroundCloseLab(ctx) {
  const captures = [];
  for (const family of CLOSE_LAB_VARIANTS) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      errorPrefix: `battle-grass-field-close-lab-${family}`,
    });
    await page.goto(
      `${ctx.target}/renderer/battle-grass-field?mode=foreground-close-lab&grassPrimitiveFamily=${family}`,
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.mode === "foreground-close-lab",
      { timeout: 18000 },
    );
    await page.waitForTimeout(160);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    if (stats?.route !== "battle-grass-field" || stats?.mode !== "foreground-close-lab") {
      await page.close();
      throw new Error(
        `foreground close grass lab did not publish valid stats for ${family}: ${JSON.stringify(stats)}`,
      );
    }

    const shot = await page.locator("#renderer-canvas").screenshot();
    captures.push({ family, stats, png: PNG.sync.read(shot) });
    await page.close();
  }

  const baseline = captureByFamily(captures, "field-fiber-shell");
  const windows = baseline.stats.lab?.reviewWindows;
  ctx.check(
    "foreground close lab publishes fixed crop-scale contract",
    baseline.stats.lab?.profile === "foreground-close-lab" &&
      baseline.stats.lab?.contract === "03B4C5B4B1" &&
      baseline.stats.camera?.zoom > 90 &&
      baseline.stats.lab?.foregroundWorldUnitsPerPixel < 0.012 &&
      windows?.closeHero &&
      windows?.transition &&
      windows?.midMass,
    JSON.stringify({ camera: baseline.stats.camera, lab: baseline.stats.lab }),
  );
  ctx.check(
    "foreground close lab variants share camera, meadow, root, seed, and field records",
    captures.every(
      (capture) =>
        capture.stats.camera?.zoom === baseline.stats.camera?.zoom &&
        capture.stats.camera?.x === baseline.stats.camera?.x &&
        capture.stats.camera?.y === baseline.stats.camera?.y &&
        capture.stats.focus?.x === baseline.stats.focus?.x &&
        capture.stats.focus?.y === baseline.stats.focus?.y &&
        capture.stats.field?.seed === baseline.stats.field?.seed &&
        capture.stats.grass?.fieldRecords === baseline.stats.grass?.fieldRecords &&
        capture.stats.ground?.meadow?.enabled === true &&
        capture.stats.ground?.meadow?.source === "field" &&
        capture.stats.ground?.meadow?.rootMassEnabled === true,
    ),
    JSON.stringify(
      captures.map((capture) => ({
        family: capture.family,
        camera: capture.stats.camera,
        focus: capture.stats.focus,
        grass: capture.stats.grass,
        meadow: capture.stats.ground?.meadow,
      })),
    ),
  );
  ctx.check(
    "foreground close lab captures rejected primitive families from the same camera",
    captures.every(
      (capture) =>
        CLOSE_LAB_VARIANTS.includes(capture.stats.grass?.grassPrimitiveFamily) &&
        capture.stats.grass?.drawCalls === 1 &&
        capture.stats.grass?.submittedTriangles > 0 &&
        capture.stats.grass?.submittedTriangles < 83200,
    ),
    JSON.stringify(
      captures.map((capture) => ({ family: capture.family, grass: capture.stats.grass })),
    ),
  );
  const metrics = closeLabWindowMetrics(baseline.png, windows);
  ctx.check(
    "foreground close lab review windows show terrain content at close, transition, and mid depth",
    metrics.closeHero.cover > 0.9 &&
      metrics.transition.cover > 0.9 &&
      metrics.midMass.cover > 0.7 &&
      metrics.closeHero.greenRatio > 0.5 &&
      metrics.transition.greenRatio > 0.5 &&
      metrics.midMass.greenRatio > 0.5 &&
      metrics.closeHero.softEdge > 0.001 &&
      metrics.transition.softEdge > 0.001 &&
      metrics.midMass.softEdge > 0.001,
    JSON.stringify(metrics),
  );

  const targetCloseHero = PNG.sync.read(await readFile(TARGET_CLOSE_HERO));
  await ctx.snap(null, "grass/foreground-close-lab", { shot: PNG.sync.write(baseline.png) });
  await ctx.snap(null, "grass/foreground-close-lab-crops", {
    shot: PNG.sync.write(composeCloseLabCropSheet(targetCloseHero, baseline.png, windows)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-rejected-families", {
    shot: PNG.sync.write(composeCloseLabFamilySheet(captures, windows.closeHero)),
  });
}

async function verifyForegroundCloseLabScaleRepair(ctx) {
  const captures = [];
  for (const candidate of SCALE_REPAIR_CANDIDATES) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      errorPrefix: `battle-grass-field-close-lab-scale-${candidate.profile}`,
    });
    await page.goto(
      `${ctx.target}/renderer/battle-grass-field?mode=foreground-close-lab&grassPrimitiveFamily=field-fiber-shell&labCameraProfile=${candidate.profile}`,
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.mode === "foreground-close-lab",
      { timeout: 18000 },
    );
    await page.waitForTimeout(160);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    if (stats?.route !== "battle-grass-field" || stats?.mode !== "foreground-close-lab") {
      await page.close();
      throw new Error(
        `foreground close scale repair did not publish valid stats for ${candidate.profile}: ${JSON.stringify(stats)}`,
      );
    }
    const shot = await page.locator("#renderer-canvas").screenshot();
    captures.push({ ...candidate, stats, png: PNG.sync.read(shot) });
    await page.close();
  }

  const current = captures.find((capture) => capture.profile === "b4b1-current");
  const selected = captures.find((capture) => capture.selected);
  if (!current || !selected) throw new Error("missing foreground close scale-repair capture");
  const windows = selected.stats.lab?.reviewWindows;
  const metrics = closeLabWindowMetrics(selected.png, windows);
  ctx.check(
    "foreground close scale repair keeps field inputs frozen while changing only camera/window profile",
    captures.every(
      (capture) =>
        capture.stats.field?.seed === current.stats.field?.seed &&
        capture.stats.field?.acceptedRecords === current.stats.field?.acceptedRecords &&
        capture.stats.grass?.fieldRecords === current.stats.grass?.fieldRecords &&
        capture.stats.ground?.meadow?.fieldRecords === current.stats.ground?.meadow?.fieldRecords &&
        capture.stats.ground?.meadow?.source === "field" &&
        capture.stats.ground?.meadow?.rootMassEnabled === true &&
        capture.stats.grass?.grassPrimitiveFamily === "field-fiber-shell",
    ),
    JSON.stringify(
      captures.map((capture) => ({
        profile: capture.profile,
        camera: capture.stats.camera,
        field: capture.stats.field,
        grass: capture.stats.grass,
        meadow: capture.stats.ground?.meadow,
      })),
    ),
  );
  ctx.check(
    "foreground close scale repair publishes B4B1R selected camera and tighter world-unit scale",
    selected.stats.lab?.contract === "03B4C5B4B1R" &&
      selected.stats.lab?.cameraProfile === "scale-repair-low" &&
      selected.stats.lab?.calibration === "neutral-scale-guides" &&
      selected.stats.lab?.foregroundWorldUnitsPerPixel <
        current.stats.lab?.foregroundWorldUnitsPerPixel &&
      selected.stats.camera?.zoom > current.stats.camera?.zoom &&
      selected.stats.camera?.pitch > current.stats.camera?.pitch &&
      windows?.closeHero &&
      windows?.transition &&
      windows?.midMass,
    JSON.stringify({
      current: current.stats.lab,
      selected: selected.stats.lab,
      camera: selected.stats.camera,
    }),
  );
  ctx.check(
    "foreground close scale repair selected review windows remain readable as close transition mid sequence",
    metrics.closeHero.cover > 0.9 &&
      metrics.transition.cover > 0.9 &&
      metrics.midMass.cover > 0.7 &&
      metrics.closeHero.greenRatio > 0.5 &&
      metrics.transition.greenRatio > 0.5 &&
      metrics.midMass.greenRatio > 0.5 &&
      metrics.closeHero.softEdge > 0.001 &&
      metrics.transition.softEdge > 0.001 &&
      metrics.midMass.softEdge > 0.001,
    JSON.stringify(metrics),
  );

  const targetCloseHero = PNG.sync.read(await readFile(TARGET_CLOSE_HERO));
  await ctx.snap(null, "grass/foreground-close-lab-scale-repair-candidates", {
    shot: PNG.sync.write(composeScaleRepairCandidateSheet(targetCloseHero, captures)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-scale-repair-selected", {
    shot: PNG.sync.write(drawScaleRepairFull(selected.png, windows)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-scale-repair-crops", {
    shot: PNG.sync.write(composeScaleRepairCropSheet(targetCloseHero, selected.png, windows)),
  });
}

async function verifyForegroundCloseLabTestEnvironment(ctx) {
  const captures = [];
  for (const candidate of TEST_ENVIRONMENT_CANDIDATES) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      errorPrefix: `battle-grass-field-close-lab-test-${candidate.profile}`,
    });
    await page.goto(
      `${ctx.target}/renderer/battle-grass-field?mode=foreground-close-lab&grassPrimitiveFamily=field-fiber-shell&labCameraProfile=${candidate.profile}`,
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.mode === "foreground-close-lab",
      { timeout: 18000 },
    );
    await page.waitForTimeout(160);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    if (stats?.route !== "battle-grass-field" || stats?.mode !== "foreground-close-lab") {
      await page.close();
      throw new Error(
        `foreground close test environment did not publish valid stats for ${candidate.profile}: ${JSON.stringify(stats)}`,
      );
    }
    const shot = await page.locator("#renderer-canvas").screenshot();
    captures.push({ ...candidate, stats, png: PNG.sync.read(shot) });
    await page.close();
  }

  const b4b1 = captures.find((capture) => capture.profile === "b4b1-current");
  const b4b1r = captures.find((capture) => capture.profile === "scale-repair-low");
  const selected = captures.find((capture) => capture.selected);
  if (!b4b1 || !b4b1r || !selected)
    throw new Error("missing foreground close test-environment capture");
  const windows = selected.stats.lab?.reviewWindows;
  const metrics = closeLabWindowMetrics(selected.png, windows);
  const targetCloseHero = PNG.sync.read(await readFile(TARGET_CLOSE_HERO));
  const selectedAspect = cropAspect(selected.png, windows.closeHero);
  const targetAspect = targetCloseHero.width / targetCloseHero.height;
  ctx.check(
    "foreground close test environment keeps body inputs frozen across absence baselines",
    captures.every(
      (capture) =>
        capture.stats.field?.seed === b4b1.stats.field?.seed &&
        capture.stats.field?.acceptedRecords === b4b1.stats.field?.acceptedRecords &&
        capture.stats.grass?.fieldRecords === b4b1.stats.grass?.fieldRecords &&
        capture.stats.grass?.grassPrimitiveFamily === "field-fiber-shell" &&
        capture.stats.grass?.accentStyle === "field-fiber-shell" &&
        capture.stats.grass?.accentAggregation === "field-near" &&
        capture.stats.grass?.fiberShellVariant === "normal" &&
        capture.stats.ground?.meadow?.source === "field" &&
        capture.stats.ground?.meadow?.rootMassEnabled === true &&
        capture.stats.lab?.frozenInputs?.palette === "green-grass",
    ),
    JSON.stringify(
      captures.map((capture) => ({
        profile: capture.profile,
        camera: capture.stats.camera,
        field: capture.stats.field,
        grass: capture.stats.grass,
        meadow: capture.stats.ground?.meadow,
        lab: capture.stats.lab,
      })),
    ),
  );
  ctx.check(
    "foreground close test environment publishes B4B1A0 fixed lab contract",
    selected.stats.lab?.contract === "03B4C5B4B1A0" &&
      selected.stats.lab?.cameraProfile === "b4b1a0-test-env" &&
      selected.stats.lab?.cropPurpose === "test-environment-comparability-not-body-acceptance" &&
      selected.stats.lab?.calibration === "test-environment-review-windows" &&
      selected.stats.lab?.foregroundWorldUnitsPerPixel <
        b4b1r.stats.lab?.foregroundWorldUnitsPerPixel &&
      selected.stats.camera?.zoom > b4b1r.stats.camera?.zoom &&
      selected.stats.camera?.pitch > 0.9 &&
      Math.abs(selectedAspect - targetAspect) < 0.45 &&
      windows?.closeHero &&
      windows?.transition &&
      windows?.midMass,
    JSON.stringify({
      b4b1: b4b1.stats.lab,
      b4b1r: b4b1r.stats.lab,
      selected: selected.stats.lab,
      camera: selected.stats.camera,
      selectedAspect,
      targetAspect,
    }),
  );
  ctx.check(
    "foreground close test environment review windows expose close transition and mid grass context",
    metrics.closeHero.cover > 0.9 &&
      metrics.transition.cover > 0.9 &&
      metrics.midMass.cover > 0.7 &&
      metrics.closeHero.greenRatio > 0.45 &&
      metrics.transition.greenRatio > 0.45 &&
      metrics.midMass.greenRatio > 0.45 &&
      metrics.closeHero.softEdge > 0.0008 &&
      metrics.transition.softEdge > 0.0008 &&
      metrics.midMass.softEdge > 0.0008,
    JSON.stringify(metrics),
  );

  await ctx.snap(null, "grass/foreground-close-lab-test-environment", {
    shot: PNG.sync.write(drawTestEnvironmentFull(selected.png, windows)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-test-environment-baselines", {
    shot: PNG.sync.write(composeTestEnvironmentBaselineSheet(targetCloseHero, captures)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-test-environment-crops", {
    shot: PNG.sync.write(composeTestEnvironmentCropSheet(targetCloseHero, selected.png, windows)),
  });
}

async function verifyForegroundCloseBodyArchitectureMatrix(ctx) {
  const captures = [];
  for (const candidate of BODY_ARCHITECTURE_CANDIDATES) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      errorPrefix: `battle-grass-field-close-body-${candidate.family}`,
    });
    await page.goto(
      `${ctx.target}/renderer/battle-grass-field?mode=foreground-close-lab&labCameraProfile=b4b1a0-test-env&grassPrimitiveFamily=${candidate.family}`,
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.mode === "foreground-close-lab",
      { timeout: 18000 },
    );
    await page.waitForTimeout(160);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    if (stats?.route !== "battle-grass-field" || stats?.mode !== "foreground-close-lab") {
      await page.close();
      throw new Error(
        `foreground close body architecture did not publish valid stats for ${candidate.family}: ${JSON.stringify(stats)}`,
      );
    }
    const shot = await page.locator("#renderer-canvas").screenshot();
    captures.push({ ...candidate, stats, png: PNG.sync.read(shot) });
    await page.close();
  }

  const baseline = captureByFamily(captures, "field-fiber-shell");
  const selected = captureByFamily(captures, "texture-volume");
  const windows = baseline.stats.lab?.reviewWindows;
  const targetCloseHero = PNG.sync.read(await readFile(TARGET_CLOSE_HERO));
  const baseCameraKey = JSON.stringify(baseline.stats.camera);
  const baseFocusKey = JSON.stringify(baseline.stats.focus);
  const baseFrozenKey = JSON.stringify(baseline.stats.lab?.frozenInputs);
  const baseField = baseline.stats.field;
  const matrixStats = captures.map((capture) => ({
    family: capture.family,
    artifact: capture.artifact,
    grass: capture.stats.grass,
    ground: capture.stats.ground?.meadow,
    lab: capture.stats.lab,
  }));

  ctx.check(
    "foreground close body architecture matrix freezes the accepted B4B1A0 lab",
    captures.every(
      (capture) =>
        capture.stats.lab?.contract === "03B4C5B4B1A0" &&
        capture.stats.lab?.cameraProfile === "b4b1a0-test-env" &&
        capture.stats.lab?.cropPurpose === "test-environment-comparability-not-body-acceptance" &&
        JSON.stringify(capture.stats.camera) === baseCameraKey &&
        JSON.stringify(capture.stats.focus) === baseFocusKey &&
        JSON.stringify(capture.stats.lab?.frozenInputs) === baseFrozenKey &&
        capture.stats.field?.seed === baseField?.seed &&
        capture.stats.field?.acceptedRecords === baseField?.acceptedRecords &&
        capture.stats.field?.candidateCells === baseField?.candidateCells &&
        capture.stats.ground?.meadow?.source === "field" &&
        capture.stats.ground?.meadow?.rootMassEnabled === true,
    ),
    JSON.stringify(matrixStats),
  );
  ctx.check(
    "foreground close body architecture matrix covers shell, workbench, and texture primitive families",
    captures.length === BODY_ARCHITECTURE_CANDIDATES.length &&
      captures.some(
        (capture) =>
          capture.stats.grass?.grassPrimitiveFamily === "field-fiber-shell" &&
          capture.stats.grass?.accentAggregation === "field-near",
      ) &&
      captures.some(
        (capture) =>
          capture.stats.grass?.grassPrimitiveFamily === "alpha-impostor" &&
          capture.stats.grass?.accentAggregation === "clump",
      ) &&
      captures.some(
        (capture) =>
          capture.stats.grass?.grassPrimitiveFamily === "billboard-cluster" &&
          capture.stats.grass?.accentAggregation === "clump",
      ) &&
      captures.some(
        (capture) =>
          capture.stats.grass?.grassPrimitiveFamily === "volume-card" &&
          capture.stats.grass?.accentAggregation === "clump",
      ) &&
      captures.filter((capture) => capture.stats.grass?.accentAggregation === "field-cell")
        .length === 3,
    JSON.stringify(matrixStats),
  );
  ctx.check(
    "foreground close body architecture matrix records comparable primitive budgets",
    captures.every(
      (capture) =>
        capture.stats.grass?.drawCalls === 1 &&
        capture.stats.grass?.submittedTriangles > 0 &&
        capture.stats.grass?.submittedTriangles < 83200 &&
        capture.stats.grass?.tuftInstances > 20 &&
        capture.stats.grass?.tuftInstances <= capture.stats.grass?.fieldRecords &&
        capture.stats.grass?.fieldRecords === baseField?.acceptedRecords &&
        capture.stats.grass?.grassPrimitiveSourceRecords > 0 &&
        capture.stats.grass?.grassPrimitiveRecords === capture.stats.grass?.tuftInstances &&
        capture.stats.grass?.instanceBytes === capture.stats.grass?.tuftInstances * 16 * 4,
    ),
    JSON.stringify(matrixStats),
  );
  ctx.check(
    "foreground close body architecture least-wrong candidate stays texture-backed and below old rejected all-card budget",
    selected.stats.grass?.grassPrimitiveFamily === "texture-volume" &&
      selected.stats.grass?.grassPrimitiveTextureBytes === 65536 &&
      selected.stats.grass?.submittedTriangles < 83200 &&
      selected.stats.grass?.grassPrimitiveRecords === selected.stats.grass?.tuftInstances &&
      selected.stats.grass?.grassPrimitiveClumps === selected.stats.grass?.accentClumps &&
      selected.stats.grass?.accentAggregation === "field-cell",
    JSON.stringify({ selected: selected.stats.grass }),
  );

  await ctx.snap(null, "grass/foreground-close-lab-body-architecture-candidates", {
    shot: PNG.sync.write(composeBodyArchitectureCandidateSheet(targetCloseHero, captures)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-body-architecture-crops", {
    shot: PNG.sync.write(composeBodyArchitectureCropSheet(targetCloseHero, captures, windows)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-body-architecture-selected", {
    shot: PNG.sync.write(drawBodyArchitectureFull(selected.png, windows)),
  });
}

async function verifyForegroundCloseBodyContinuityRepair(ctx) {
  const captures = [];
  for (const candidate of BODY_CONTINUITY_REPAIR_CANDIDATES) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      errorPrefix: `battle-grass-field-close-body-repair-${candidate.profile}`,
    });
    await page.goto(
      `${ctx.target}/renderer/battle-grass-field?mode=foreground-close-lab&labCameraProfile=b4b1a0-test-env&grassPrimitiveFamily=texture-volume&textureVolumeProfile=${candidate.profile}`,
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.mode === "foreground-close-lab",
      { timeout: 18000 },
    );
    await page.waitForTimeout(160);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    if (stats?.route !== "battle-grass-field" || stats?.mode !== "foreground-close-lab") {
      await page.close();
      throw new Error(
        `foreground close body continuity repair did not publish valid stats for ${candidate.profile}: ${JSON.stringify(stats)}`,
      );
    }
    const shot = await page.locator("#renderer-canvas").screenshot();
    captures.push({ ...candidate, family: "texture-volume", stats, png: PNG.sync.read(shot) });
    await page.close();
  }

  const baseline = captures.find((capture) => capture.profile === "current");
  const selected = captures.find((capture) => capture.selected) ?? captures[0];
  const windows = baseline.stats.lab?.reviewWindows;
  const targetCloseHero = PNG.sync.read(await readFile(TARGET_CLOSE_HERO));
  const baseCameraKey = JSON.stringify(baseline.stats.camera);
  const baseFocusKey = JSON.stringify(baseline.stats.focus);
  const baseFrozenKey = JSON.stringify(baseline.stats.lab?.frozenInputs);
  const baseField = baseline.stats.field;
  const repairStats = captures.map((capture) => ({
    profile: capture.profile,
    artifact: capture.artifact,
    grass: capture.stats.grass,
    ground: capture.stats.ground?.meadow,
    lab: capture.stats.lab,
  }));

  ctx.check(
    "foreground close body continuity repair freezes the accepted B4B1A0 lab",
    captures.every(
      (capture) =>
        capture.stats.lab?.contract === "03B4C5B4B1A0" &&
        capture.stats.lab?.cameraProfile === "b4b1a0-test-env" &&
        capture.stats.lab?.cropPurpose === "test-environment-comparability-not-body-acceptance" &&
        JSON.stringify(capture.stats.camera) === baseCameraKey &&
        JSON.stringify(capture.stats.focus) === baseFocusKey &&
        JSON.stringify(capture.stats.lab?.frozenInputs) === baseFrozenKey &&
        capture.stats.field?.seed === baseField?.seed &&
        capture.stats.field?.acceptedRecords === baseField?.acceptedRecords &&
        capture.stats.field?.candidateCells === baseField?.candidateCells &&
        capture.stats.ground?.meadow?.source === "field" &&
        capture.stats.ground?.meadow?.rootMassEnabled === true,
    ),
    JSON.stringify(repairStats),
  );
  ctx.check(
    "foreground close body continuity repair compares texture-volume profiles only",
    captures.length === BODY_CONTINUITY_REPAIR_CANDIDATES.length &&
      captures.every(
        (capture) =>
          capture.stats.grass?.grassPrimitiveFamily === "texture-volume" &&
          capture.stats.grass?.accentStyle === "volume-card" &&
          capture.stats.grass?.accentAggregation === "field-cell" &&
          capture.stats.grass?.textureVolumeProfile === capture.profile,
      ),
    JSON.stringify(repairStats),
  );
  ctx.check(
    "foreground close body continuity repair keeps comparable primitive budgets",
    captures.every(
      (capture) =>
        capture.stats.grass?.drawCalls === 1 &&
        capture.stats.grass?.submittedTriangles > 0 &&
        capture.stats.grass?.submittedTriangles < 83200 &&
        capture.stats.grass?.tuftInstances > 20 &&
        capture.stats.grass?.tuftInstances <= capture.stats.grass?.fieldRecords &&
        capture.stats.grass?.fieldRecords === baseField?.acceptedRecords &&
        capture.stats.grass?.grassPrimitiveSourceRecords > 0 &&
        capture.stats.grass?.grassPrimitiveRecords === capture.stats.grass?.tuftInstances &&
        capture.stats.grass?.instanceBytes === capture.stats.grass?.tuftInstances * 16 * 4,
    ),
    JSON.stringify(repairStats),
  );

  await ctx.snap(null, "grass/foreground-close-lab-body-continuity-candidates", {
    shot: PNG.sync.write(composeBodyContinuityCandidateSheet(targetCloseHero, captures)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-body-continuity-crops", {
    shot: PNG.sync.write(composeBodyContinuityCropSheet(targetCloseHero, captures, windows)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-body-continuity-selected", {
    shot: PNG.sync.write(drawBodyArchitectureFull(selected.png, windows)),
  });
}

async function verifyForegroundCloseBodyAlphaRenderModel(ctx) {
  const captures = [];
  for (const candidate of BODY_ALPHA_RENDER_MODEL_CANDIDATES) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      errorPrefix: `battle-grass-field-close-body-alpha-${candidate.renderModel}`,
    });
    await page.goto(
      `${ctx.target}/renderer/battle-grass-field?mode=foreground-close-lab&labCameraProfile=b4b1a0-test-env&grassPrimitiveFamily=texture-volume&textureVolumeProfile=current&textureVolumeRenderModel=${candidate.renderModel}`,
    );
    await page.waitForFunction(
      () =>
        window.__rendererLabReady === true &&
        window.__rendererLabStats?.stats?.mode === "foreground-close-lab",
      { timeout: 18000 },
    );
    await page.waitForTimeout(160);
    const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
    if (stats?.route !== "battle-grass-field" || stats?.mode !== "foreground-close-lab") {
      await page.close();
      throw new Error(
        `foreground close body alpha render-model did not publish valid stats for ${candidate.renderModel}: ${JSON.stringify(stats)}`,
      );
    }
    const shot = await page.locator("#renderer-canvas").screenshot();
    captures.push({ ...candidate, family: "texture-volume", stats, png: PNG.sync.read(shot) });
    await page.close();
  }

  const baseline = captures.find((capture) => capture.renderModel === "opaque-card");
  const selected = captures.find((capture) => capture.selected) ?? captures[0];
  const windows = baseline.stats.lab?.reviewWindows;
  const targetCloseHero = PNG.sync.read(await readFile(TARGET_CLOSE_HERO));
  const baseCameraKey = JSON.stringify(baseline.stats.camera);
  const baseFocusKey = JSON.stringify(baseline.stats.focus);
  const baseFrozenKey = JSON.stringify(baseline.stats.lab?.frozenInputs);
  const baseField = baseline.stats.field;
  const alphaStats = captures.map((capture) => ({
    renderModel: capture.renderModel,
    artifact: capture.artifact,
    grass: capture.stats.grass,
    ground: capture.stats.ground?.meadow,
    lab: capture.stats.lab,
  }));

  ctx.check(
    "foreground close body alpha render-model freezes the accepted B4B1A0 lab",
    captures.every(
      (capture) =>
        capture.stats.lab?.contract === "03B4C5B4B1A0" &&
        capture.stats.lab?.cameraProfile === "b4b1a0-test-env" &&
        capture.stats.lab?.cropPurpose === "test-environment-comparability-not-body-acceptance" &&
        JSON.stringify(capture.stats.camera) === baseCameraKey &&
        JSON.stringify(capture.stats.focus) === baseFocusKey &&
        JSON.stringify(capture.stats.lab?.frozenInputs) === baseFrozenKey &&
        capture.stats.field?.seed === baseField?.seed &&
        capture.stats.field?.acceptedRecords === baseField?.acceptedRecords &&
        capture.stats.field?.candidateCells === baseField?.candidateCells &&
        capture.stats.ground?.meadow?.source === "field" &&
        capture.stats.ground?.meadow?.rootMassEnabled === true,
    ),
    JSON.stringify(alphaStats),
  );
  ctx.check(
    "foreground close body alpha render-model compares render models only",
    captures.length === BODY_ALPHA_RENDER_MODEL_CANDIDATES.length &&
      captures.every(
        (capture) =>
          capture.stats.grass?.grassPrimitiveFamily === "texture-volume" &&
          capture.stats.grass?.accentStyle === "volume-card" &&
          capture.stats.grass?.accentAggregation === "field-cell" &&
          capture.stats.grass?.textureVolumeProfile === "current" &&
          capture.stats.grass?.textureVolumeRenderModel === capture.renderModel,
      ),
    JSON.stringify(alphaStats),
  );
  ctx.check(
    "foreground close body alpha render-model preserves texture-volume primitive budgets",
    captures.every(
      (capture) =>
        capture.stats.grass?.drawCalls === 1 &&
        capture.stats.grass?.submittedTriangles === baseline.stats.grass?.submittedTriangles &&
        capture.stats.grass?.tuftInstances === baseline.stats.grass?.tuftInstances &&
        capture.stats.grass?.fieldRecords === baseline.stats.grass?.fieldRecords &&
        capture.stats.grass?.grassPrimitiveRecords ===
          baseline.stats.grass?.grassPrimitiveRecords &&
        capture.stats.grass?.grassPrimitiveClumps === baseline.stats.grass?.grassPrimitiveClumps &&
        capture.stats.grass?.instanceBytes === baseline.stats.grass?.instanceBytes,
    ),
    JSON.stringify(alphaStats),
  );

  await ctx.snap(null, "grass/foreground-close-lab-body-alpha-model-candidates", {
    shot: PNG.sync.write(composeBodyAlphaRenderModelCandidateSheet(targetCloseHero, captures)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-body-alpha-model-crops", {
    shot: PNG.sync.write(composeBodyAlphaRenderModelCropSheet(targetCloseHero, captures, windows)),
  });
  await ctx.snap(null, "grass/foreground-close-lab-body-alpha-model-selected", {
    shot: PNG.sync.write(drawBodyArchitectureFull(selected.png, windows)),
  });
}

function hasPackedTelemetry(stats) {
  const grass = stats?.grass;
  return (
    grass?.prepMode === "packed-field" &&
    grass.fieldRecords > 100 &&
    grass.fieldRejectedSlopeCells > 0 &&
    grass.packedStrideFloats === 16 &&
    grass.fieldRecordStrideFloats === 16 &&
    grass.instanceBytes === grass.fieldRecords * 16 * 4 &&
    grass.submittedTriangles > 0 &&
    grass.drawCalls === 1
  );
}

function hasFieldMeadowTelemetry(stats) {
  const grass = stats?.grass;
  const meadow = stats?.ground?.meadow;
  return (
    grass?.prepMode === "packed-field" &&
    grass.fieldRecords > 100 &&
    grass.packedStrideFloats === 16 &&
    meadow?.enabled === true &&
    meadow.source === "field" &&
    meadow.fieldRecords === grass.fieldRecords &&
    meadow.fieldCoverage > 0.5 &&
    meadow.avgDensity > 0.18 &&
    meadow.directionalCoverage > 0.2 &&
    meadow.textureWidth > 1 &&
    meadow.textureHeight > 1
  );
}

function hasPackedWorldDepthPass(phases) {
  return (
    Array.isArray(phases) &&
    phases.some(
      (phase) =>
        phase?.kind === "world-depth" &&
        phase.passIds?.includes("battle-grass-field-packed-tilt") &&
        phase.depthPasses?.some(
          (pass) => pass.id === "battle-grass-field-packed-tilt" && pass.mode === "read-write",
        ) &&
        phase.passRoles?.some(
          (pass) => pass.id === "battle-grass-field-packed-tilt" && pass.role === "world-opaque",
        ),
    )
  );
}

function captureByFamily(captures, family) {
  const capture = captures.find((entry) => entry.family === family);
  if (!capture) throw new Error(`missing close-lab capture: ${family}`);
  return capture;
}

function packedGrassMetrics(png) {
  return {
    grassField: regionMetrics(png, 0.02, 0.08, 0.3, 0.82),
    steepRamp: regionMetrics(png, 0.45, 0.08, 0.48, 0.82),
  };
}

function fieldMeadowMetrics(png) {
  return {
    meadow: meadowRegionMetrics(png, 0.02, 0.2, 0.34, 0.66),
    steepRamp: regionMetrics(png, 0.45, 0.08, 0.48, 0.82),
  };
}

function closeLabWindowMetrics(png, windows) {
  return {
    closeHero: meadowRegionMetrics(
      png,
      windows.closeHero.x,
      windows.closeHero.y,
      windows.closeHero.width,
      windows.closeHero.height,
    ),
    transition: meadowRegionMetrics(
      png,
      windows.transition.x,
      windows.transition.y,
      windows.transition.width,
      windows.transition.height,
    ),
    midMass: meadowRegionMetrics(
      png,
      windows.midMass.x,
      windows.midMass.y,
      windows.midMass.width,
      windows.midMass.height,
    ),
  };
}

function composeCloseLabCropSheet(targetCloseHero, labImage, windows) {
  return composeGrid(
    [
      bordered(resizeToWidth(targetCloseHero, 420), [190, 42, 28, 255]),
      bordered(resizeToWidth(cropRatio(labImage, windows.closeHero), 420), [190, 42, 28, 255]),
      bordered(resizeToWidth(cropRatio(labImage, windows.closeTight2x), 420), [88, 88, 88, 255]),
      bordered(resizeToWidth(cropRatio(labImage, windows.closeTight4x), 420), [24, 24, 24, 255]),
      bordered(resizeToWidth(cropRatio(labImage, windows.transition), 420), [206, 116, 32, 255]),
      bordered(resizeToWidth(cropRatio(labImage, windows.midMass), 420), [52, 91, 174, 255]),
    ],
    3,
  );
}

function composeCloseLabFamilySheet(captures, closeWindow) {
  return composeGrid(
    captures.map((capture) =>
      bordered(
        resizeToWidth(cropRatio(capture.png, closeWindow), 360),
        familyColor(capture.family),
      ),
    ),
    captures.length,
  );
}

function composeScaleRepairCandidateSheet(targetCloseHero, captures) {
  const target = bordered(withScaleGuides(resizeToWidth(targetCloseHero, 420)), [190, 42, 28, 255]);
  const closeCrops = captures.map((capture) =>
    bordered(
      withScaleGuides(
        resizeToWidth(cropRatio(capture.png, capture.stats.lab.reviewWindows.closeHero), 420),
        { proxies: capture.profile !== "b4b1-current" },
      ),
      capture.color,
    ),
  );
  const fullShots = captures.map((capture) =>
    bordered(
      resizeToWidth(drawScaleRepairFull(capture.png, capture.stats.lab.reviewWindows), 420),
      capture.color,
    ),
  );
  return composeGrid([target, ...closeCrops, ...fullShots], 4);
}

function composeScaleRepairCropSheet(targetCloseHero, labImage, windows) {
  return composeGrid(
    [
      bordered(withScaleGuides(resizeToWidth(targetCloseHero, 420)), [190, 42, 28, 255]),
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(labImage, windows.closeHero), 420), {
          proxies: true,
        }),
        [60, 116, 62, 255],
      ),
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(labImage, windows.closeTight2x), 420), {
          proxies: true,
        }),
        [88, 88, 88, 255],
      ),
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(labImage, windows.closeTight4x), 420), {
          proxies: true,
        }),
        [24, 24, 24, 255],
      ),
      bordered(resizeToWidth(cropRatio(labImage, windows.transition), 420), [206, 116, 32, 255]),
      bordered(resizeToWidth(cropRatio(labImage, windows.midMass), 420), [52, 91, 174, 255]),
    ],
    3,
  );
}

function composeTestEnvironmentBaselineSheet(targetCloseHero, captures) {
  const target = captioned(
    bordered(withScaleGuides(resizeToWidth(targetCloseHero, 420)), [190, 42, 28, 255]),
    "TARGET CLOSE",
  );
  const closeCrops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(
          resizeToWidth(cropRatio(capture.png, capture.stats.lab.reviewWindows.closeHero), 420),
          { proxies: capture.profile !== "b4b1-current" },
        ),
        capture.color,
      ),
      closeLabProfileLabel(capture.profile),
    ),
  );
  const fullShots = captures.map((capture) =>
    captioned(
      bordered(
        resizeToWidth(drawTestEnvironmentFull(capture.png, capture.stats.lab.reviewWindows), 420),
        capture.color,
      ),
      `FULL ${closeLabProfileLabel(capture.profile)}`,
    ),
  );
  return composeGrid([target, ...closeCrops, ...fullShots], 4);
}

function composeTestEnvironmentCropSheet(targetCloseHero, labImage, windows) {
  return composeGrid(
    [
      captioned(
        bordered(withScaleGuides(resizeToWidth(targetCloseHero, 420)), [190, 42, 28, 255]),
        "TARGET CLOSE",
      ),
      captioned(
        bordered(
          withScaleGuides(resizeToWidth(cropRatio(labImage, windows.closeHero), 420), {
            proxies: true,
          }),
          [168, 86, 42, 255],
        ),
        "B4B1A0 CLOSE HERO",
      ),
      captioned(
        bordered(
          withScaleGuides(resizeToWidth(cropRatio(labImage, windows.closeTight2x), 420), {
            proxies: true,
          }),
          [88, 88, 88, 255],
        ),
        "B4B1A0 CLOSE 2X",
      ),
      captioned(
        bordered(
          withScaleGuides(resizeToWidth(cropRatio(labImage, windows.closeTight4x), 420), {
            proxies: true,
          }),
          [24, 24, 24, 255],
        ),
        "B4B1A0 CLOSE 4X",
      ),
      captioned(
        bordered(resizeToWidth(cropRatio(labImage, windows.transition), 420), [206, 116, 32, 255]),
        "B4B1A0 TRANSITION",
      ),
      captioned(
        bordered(resizeToWidth(cropRatio(labImage, windows.midMass), 420), [52, 91, 174, 255]),
        "B4B1A0 MID MASS",
      ),
    ],
    3,
  );
}

function composeBodyArchitectureCandidateSheet(targetCloseHero, captures) {
  const target = captioned(
    bordered(withScaleGuides(resizeToWidth(targetCloseHero, 360)), [190, 42, 28, 255]),
    "TARGET CLOSE",
  );
  const crops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(
          resizeToWidth(cropRatio(capture.png, capture.stats.lab.reviewWindows.closeHero), 360),
          { proxies: true },
        ),
        capture.color,
      ),
      bodyArchitectureLabel(capture),
    ),
  );
  return composeGrid([target, ...crops], 4);
}

function composeBodyArchitectureCropSheet(targetCloseHero, captures, windows) {
  const target = captioned(
    bordered(withScaleGuides(resizeToWidth(targetCloseHero, 360)), [190, 42, 28, 255]),
    "TARGET CLOSE",
  );
  const closeCrops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(capture.png, windows.closeHero), 360), {
          proxies: true,
        }),
        capture.color,
      ),
      bodyArchitectureLabel(capture),
    ),
  );
  const tightCrops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(capture.png, windows.closeTight2x), 360), {
          proxies: true,
        }),
        capture.color,
      ),
      `2X ${bodyArchitectureShortLabel(capture.family)}`,
    ),
  );
  return composeGrid([target, ...closeCrops, ...tightCrops], 4);
}

function composeBodyContinuityCandidateSheet(targetCloseHero, captures) {
  const target = captioned(
    bordered(withScaleGuides(resizeToWidth(targetCloseHero, 360)), [190, 42, 28, 255]),
    "TARGET CLOSE",
  );
  const crops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(
          resizeToWidth(cropRatio(capture.png, capture.stats.lab.reviewWindows.closeHero), 360),
          { proxies: true },
        ),
        capture.color,
      ),
      bodyContinuityLabel(capture),
    ),
  );
  return composeGrid([target, ...crops], 3);
}

function composeBodyContinuityCropSheet(targetCloseHero, captures, windows) {
  const target = captioned(
    bordered(withScaleGuides(resizeToWidth(targetCloseHero, 360)), [190, 42, 28, 255]),
    "TARGET CLOSE",
  );
  const closeCrops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(capture.png, windows.closeHero), 360), {
          proxies: true,
        }),
        capture.color,
      ),
      bodyContinuityLabel(capture),
    ),
  );
  const tightCrops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(capture.png, windows.closeTight2x), 360), {
          proxies: true,
        }),
        capture.color,
      ),
      `2X ${bodyContinuityShortLabel(capture.profile)}`,
    ),
  );
  return composeGrid([target, ...closeCrops, ...tightCrops], 3);
}

function composeBodyAlphaRenderModelCandidateSheet(targetCloseHero, captures) {
  const target = captioned(
    bordered(withScaleGuides(resizeToWidth(targetCloseHero, 360)), [190, 42, 28, 255]),
    "TARGET CLOSE",
  );
  const crops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(
          resizeToWidth(cropRatio(capture.png, capture.stats.lab.reviewWindows.closeHero), 360),
          { proxies: true },
        ),
        capture.color,
      ),
      bodyAlphaRenderModelLabel(capture),
    ),
  );
  return composeGrid([target, ...crops], 4);
}

function composeBodyAlphaRenderModelCropSheet(targetCloseHero, captures, windows) {
  const target = captioned(
    bordered(withScaleGuides(resizeToWidth(targetCloseHero, 360)), [190, 42, 28, 255]),
    "TARGET CLOSE",
  );
  const closeCrops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(capture.png, windows.closeHero), 360), {
          proxies: true,
        }),
        capture.color,
      ),
      bodyAlphaRenderModelLabel(capture),
    ),
  );
  const tightCrops = captures.map((capture) =>
    captioned(
      bordered(
        withScaleGuides(resizeToWidth(cropRatio(capture.png, windows.closeTight2x), 360), {
          proxies: true,
        }),
        capture.color,
      ),
      `2X ${bodyAlphaRenderModelShortLabel(capture.renderModel)}`,
    ),
  );
  return composeGrid([target, ...closeCrops, ...tightCrops], 4);
}

function bodyArchitectureLabel(capture) {
  return `${bodyArchitectureShortLabel(capture.family)} ${capture.stats.grass.submittedTriangles}T`;
}

function bodyArchitectureShortLabel(family) {
  if (family === "field-fiber-shell") return "FIELD SHELL";
  if (family === "alpha-impostor") return "ALPHA IMP";
  if (family === "billboard-cluster") return "BILLBOARD";
  if (family === "volume-card") return "VOLUME CARD";
  if (family === "texture-volume") return "TEX VOLUME";
  if (family === "texture-carrier") return "TEX CARRIER";
  if (family === "texture-micro-carrier") return "MICRO CARRIER";
  return String(family).toUpperCase();
}

function bodyContinuityLabel(capture) {
  return `${bodyContinuityShortLabel(capture.profile)} ${capture.stats.grass.submittedTriangles}T`;
}

function bodyContinuityShortLabel(profile) {
  if (profile === "current") return "CURRENT";
  if (profile === "seated-soft") return "SEATED";
  if (profile === "overlap-stagger") return "STAGGER";
  if (profile === "broken-lattice") return "LATTICE";
  return String(profile).toUpperCase();
}

function bodyAlphaRenderModelLabel(capture) {
  return `${bodyAlphaRenderModelShortLabel(capture.renderModel)} ${capture.stats.grass.submittedTriangles}T`;
}

function bodyAlphaRenderModelShortLabel(renderModel) {
  if (renderModel === "opaque-card") return "OPAQUE";
  if (renderModel === "alpha-cutout") return "CUTOUT";
  if (renderModel === "hard-cutout") return "HARD";
  if (renderModel === "dither-cutout") return "DITHER";
  if (renderModel === "sparse-dither") return "SPARSE";
  return String(renderModel).toUpperCase();
}

function closeLabProfileLabel(profile) {
  if (profile === "b4b1-current") return "B4B1 ABSENCE";
  if (profile === "scale-repair-low") return "B4B1R ABSENCE";
  if (profile === "b4b1a0-test-env") return "B4B1A0 TEST ENV";
  return String(profile).toUpperCase();
}

function drawScaleRepairFull(src, windows) {
  const out = drawReviewWindows(clonePng(src), windows);
  drawWindowCalibrationProxies(out, windows);
  return out;
}

function drawTestEnvironmentFull(src, windows) {
  const out = drawReviewWindows(clonePng(src), windows);
  drawWindowCalibrationProxies(out, windows);
  return out;
}

function drawBodyArchitectureFull(src, windows) {
  const out = drawReviewWindows(clonePng(src), windows);
  drawWindowCalibrationProxies(out, windows);
  return out;
}

function clonePng(src) {
  const out = new PNG({ width: src.width, height: src.height });
  src.data.copy(out.data);
  return out;
}

function drawReviewWindows(png, windows) {
  drawRatioRect(png, windows.closeHero, [190, 42, 28, 255]);
  drawRatioRect(png, windows.transition, [206, 116, 32, 255]);
  drawRatioRect(png, windows.midMass, [52, 91, 174, 255]);
  return png;
}

function drawRatioRect(png, window, rgba) {
  const x = Math.round(window.x * png.width);
  const y = Math.round(window.y * png.height);
  const w = Math.round(window.width * png.width);
  const h = Math.round(window.height * png.height);
  drawRect(png, x, y, w, h, rgba, 3);
}

function withScaleGuides(png, options = {}) {
  const out = clonePng(png);
  if (options.proxies) drawCropCalibrationProxies(out);
  const baseY = out.height - 14;
  [18, 32, 48].forEach((height, index) => {
    const x = 22 + index * 18;
    drawLine(out, x, baseY, x, Math.max(4, baseY - height), [236, 238, 222, 230], 3);
    drawLine(
      out,
      x - 5,
      Math.max(4, baseY - height),
      x + 5,
      Math.max(4, baseY - height),
      [32, 42, 35, 230],
      2,
    );
  });
  [0.33, 0.66].forEach((t) => {
    const y = Math.round(out.height * t);
    drawLine(out, 0, y, out.width - 1, y, [236, 238, 222, 80], 1);
  });
  return out;
}

function drawCropCalibrationProxies(png) {
  const baseY = png.height - 18;
  const xs = [0.18, 0.28, 0.39, 0.53, 0.66, 0.78, 0.88];
  xs.forEach((fraction, index) => {
    const x = Math.round(png.width * fraction);
    const height = 26 + (index % 3) * 8;
    drawLine(png, x, baseY, x, Math.max(4, baseY - height), [226, 228, 206, 190], 3);
    drawLine(
      png,
      x - 4,
      Math.max(4, baseY - height),
      x + 4,
      Math.max(4, baseY - height),
      [44, 54, 45, 190],
      2,
    );
  });
}

function drawWindowCalibrationProxies(png, windows) {
  drawProxyBand(png, windows.closeHero, 36, 0.78);
  drawProxyBand(png, windows.transition, 22, 0.55);
  drawProxyBand(png, windows.midMass, 13, 0.38);
}

function drawProxyBand(png, window, height, alpha) {
  const x0 = Math.round(window.x * png.width);
  const y0 = Math.round(window.y * png.height);
  const w = Math.round(window.width * png.width);
  const h = Math.round(window.height * png.height);
  const baseY = y0 + Math.round(h * 0.78);
  const count = 9;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = x0 + Math.round(w * t);
    const localHeight = Math.round(height * (0.75 + ((i * 37) % 5) * 0.09));
    drawLine(
      png,
      x,
      baseY,
      x,
      Math.max(y0 + 2, baseY - localHeight),
      [226, 228, 206, Math.round(255 * alpha)],
      Math.max(1, Math.round(height / 15)),
    );
    drawLine(
      png,
      x - 3,
      Math.max(y0 + 2, baseY - localHeight),
      x + 3,
      Math.max(y0 + 2, baseY - localHeight),
      [46, 54, 46, Math.round(190 * alpha)],
      1,
    );
  }
}

function drawRect(png, x, y, w, h, rgba, thickness = 1) {
  drawLine(png, x, y, x + w, y, rgba, thickness);
  drawLine(png, x, y + h, x + w, y + h, rgba, thickness);
  drawLine(png, x, y, x, y + h, rgba, thickness);
  drawLine(png, x + w, y, x + w, y + h, rgba, thickness);
}

function drawLine(png, x0, y0, x1, y1, rgba, thickness = 1) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (true) {
    drawPoint(png, x, y, rgba, thickness);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawPoint(png, cx, cy, rgba, thickness) {
  const radius = Math.max(0, Math.floor(thickness / 2));
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) blendPixel(png, x, y, rgba);
  }
}

function blendPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  const a = rgba[3] / 255;
  png.data[i] = Math.round(png.data[i] * (1 - a) + rgba[0] * a);
  png.data[i + 1] = Math.round(png.data[i + 1] * (1 - a) + rgba[1] * a);
  png.data[i + 2] = Math.round(png.data[i + 2] * (1 - a) + rgba[2] * a);
  png.data[i + 3] = 255;
}

function regionMetrics(png, rx, ry, rw, rh) {
  let total = 0;
  let cover = 0;
  let edge = 0;
  let deltaSum = 0;
  const x0 = Math.floor(png.width * rx);
  const x1 = Math.floor(png.width * (rx + rw));
  const y0 = Math.floor(png.height * ry);
  const y1 = Math.floor(png.height * (ry + rh));
  for (let y = y0 + 1; y < y1; y++) {
    for (let x = x0 + 1; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const left = (y * png.width + x - 1) * 4;
      const up = ((y - 1) * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      if (!(b > r && b > g && b > 170)) cover++;
      const delta =
        Math.abs(r - png.data[left]) +
        Math.abs(g - png.data[left + 1]) +
        Math.abs(b - png.data[left + 2]) +
        Math.abs(r - png.data[up]) +
        Math.abs(g - png.data[up + 1]) +
        Math.abs(b - png.data[up + 2]);
      deltaSum += delta;
      if (delta > 32) edge++;
    }
  }
  return {
    cover: Number((cover / total).toFixed(3)),
    edge: Number((edge / total).toFixed(4)),
    softEdge: Number((deltaSum / Math.max(1, total * 255 * 2)).toFixed(4)),
  };
}

function meadowRegionMetrics(png, rx, ry, rw, rh) {
  let total = 0;
  let green = 0;
  const base = regionMetrics(png, rx, ry, rw, rh);
  const x0 = Math.floor(png.width * rx);
  const x1 = Math.floor(png.width * (rx + rw));
  const y0 = Math.floor(png.height * ry);
  const y1 = Math.floor(png.height * (ry + rh));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      if (g > r * 1.02 && g > b * 1.08 && r > 42 && b > 28) green++;
    }
  }
  return {
    ...base,
    greenRatio: Number((green / Math.max(1, total)).toFixed(3)),
  };
}

function cropRatio(src, window) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(src.width * window.x)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(src.height * window.y)));
  const w = Math.max(1, Math.min(src.width - x0, Math.floor(src.width * window.width)));
  const h = Math.max(1, Math.min(src.height - y0, Math.floor(src.height * window.height)));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) copyPixel(src, x0 + x, y0 + y, out, x, y);
  }
  return out;
}

function cropAspect(src, window) {
  const width = Math.max(1, Math.floor(src.width * window.width));
  const height = Math.max(1, Math.floor(src.height * window.height));
  return width / height;
}

function resizeToWidth(src, width) {
  return resize(src, width, Math.max(1, Math.round(src.height * (width / src.width))));
}

function resize(src, width, height) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
      copyPixel(src, sx, sy, out, x, y);
    }
  }
  return out;
}

function composeGrid(images, columns) {
  const gap = 12;
  const cellW = Math.max(...images.map((image) => image.width));
  const cellH = Math.max(...images.map((image) => image.height));
  const rows = Math.ceil(images.length / columns);
  const out = solidPng(
    columns * cellW + gap * (columns - 1),
    rows * cellH + gap * (rows - 1),
    [218, 224, 224, 255],
  );
  for (let i = 0; i < images.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    paste(out, images[i], col * (cellW + gap), row * (cellH + gap));
  }
  return out;
}

function bordered(src, rgba) {
  const border = 4;
  const out = solidPng(src.width + border * 2, src.height + border * 2, rgba);
  paste(out, src, border, border);
  return out;
}

function captioned(src, label) {
  const captionH = 20;
  const out = solidPng(src.width, src.height + captionH, [232, 236, 234, 255]);
  drawText(out, label, 7, 6, [37, 44, 38, 255], 2);
  paste(out, src, 0, captionH);
  return out;
}

const FONT_3X5 = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "111", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["110", "001", "010", "100", "111"],
  3: ["110", "001", "010", "001", "110"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "110", "001", "110"],
  6: ["011", "100", "110", "101", "010"],
  7: ["111", "001", "010", "010", "010"],
  8: ["010", "101", "010", "101", "010"],
  9: ["010", "101", "011", "001", "110"],
};

function drawText(dst, text, x, y, rgba, scale = 1) {
  let cursor = x;
  for (const ch of text.toUpperCase()) {
    if (ch === " ") {
      cursor += 3 * scale;
      continue;
    }
    const glyph = FONT_3X5[ch];
    if (!glyph) {
      cursor += 4 * scale;
      continue;
    }
    drawGlyph(dst, glyph, cursor, y, rgba, scale);
    cursor += 4 * scale;
  }
}

function drawGlyph(dst, glyph, x0, y0, rgba, scale) {
  for (let gy = 0; gy < glyph.length; gy++) {
    for (let gx = 0; gx < glyph[gy].length; gx++) {
      if (glyph[gy][gx] !== "1") continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          setPixel(dst, x0 + gx * scale + sx, y0 + gy * scale + sy, rgba);
        }
      }
    }
  }
}

function familyColor(family) {
  if (family === "field-fiber-shell") return [66, 103, 48, 255];
  if (family === "texture-volume") return [92, 83, 46, 255];
  if (family === "texture-carrier") return [142, 92, 44, 255];
  return [75, 78, 118, 255];
}

function solidPng(width, height, rgba) {
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = rgba[0];
    out.data[i + 1] = rgba[1];
    out.data[i + 2] = rgba[2];
    out.data[i + 3] = rgba[3];
  }
  return out;
}

function paste(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) copyPixel(src, x, y, dst, dx + x, dy + y);
  }
}

function setPixel(dst, x, y, rgba) {
  if (x < 0 || y < 0 || x >= dst.width || y >= dst.height) return;
  const i = (y * dst.width + x) * 4;
  dst.data[i] = rgba[0];
  dst.data[i + 1] = rgba[1];
  dst.data[i + 2] = rgba[2];
  dst.data[i + 3] = rgba[3];
}

function copyPixel(src, sx, sy, dst, dx, dy) {
  const si = (sy * src.width + sx) * 4;
  const di = (dy * dst.width + dx) * 4;
  dst.data[di] = src.data[si];
  dst.data[di + 1] = src.data[si + 1];
  dst.data[di + 2] = src.data[si + 2];
  dst.data[di + 3] = src.data[si + 3];
}
