import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const ASSET_DIR = new URL(
  "../../../specs/battle-map-reference/assets/04a2a-midground-occlusion-instrument/",
  import.meta.url,
);

const VIEWPORT = { width: 1638, height: 800 };
const QUERY =
  "gate=highland-valley&view=reference&grassTechnique=off&groundDiagnostic=landform-clay&geometryProbe=midground-valley";

export const meta = {
  name: "battle-map-reference-midground-occlusion",
  kind: "visual",
  world: "battle-map-reference",
  tier: "full",
  snapshots: [
    "map-reference/midground-occlusion-hillshade",
    "map-reference/midground-occlusion-profiles",
  ],
  describe:
    "04A2A: records terrain-height occlusion telemetry for the midground crop so clay contour stripes cannot fake rolling valley acceptance.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") {
    ctx.check("midground occlusion probe requires browser GPU flags", true, "set VERIFY_GPU=1");
    return;
  }

  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-map-reference-midground-occlusion",
  });
  await page.goto(`${ctx.target}/renderer/battle-terrain-3d?${QUERY}`);
  await page.waitForFunction(
    () =>
      window.__rendererLabReady === true && window.__rendererLabStats?.stats?.midgroundOcclusion,
    { timeout: 20000 },
  );
  await page.waitForTimeout(100);
  const stats = await page.evaluate(() => window.__rendererLabStats?.stats ?? null);
  await page.close();

  const probe = stats?.midgroundOcclusion ?? null;
  if (!probe?.heightPatch || !Array.isArray(probe.columns)) {
    ctx.check(
      "midground occlusion probe publishes geometry-truth samples",
      false,
      JSON.stringify(probe?.summary ?? null),
    );
    return;
  }
  const routeLocked =
    stats?.route === "battle-terrain-3d" &&
    stats?.gate === "highland-valley" &&
    stats?.view === "reference" &&
    stats?.camera?.x === -380 &&
    stats?.camera?.y === -160 &&
    stats?.camera?.zoom === 3.2 &&
    stats?.camera?.pitch === 1.52 &&
    stats?.camera?.yaw === -0.035 &&
    stats?.ground?.diagnosticMode === "landform-clay" &&
    stats?.grassTechnique === "off" &&
    stats?.grass?.bladeInstances === 0;
  const probePublished =
    probe?.summary?.columnCount === 9 &&
    probe?.summary?.samplesPerColumn === 72 &&
    probe?.heightPatch?.cols === 64 &&
    probe?.heightPatch?.rows === 48;
  const rejectsCurrentTerraces =
    probe?.summary?.rejectedHorizontalTerraceCandidate === true &&
    probe?.summary?.meanVisibleCrests < 2 &&
    probe?.summary?.maxVisibleCrests < 2;
  const positiveControlAccepted =
    probe?.positiveControl?.name === "synthetic-overlapping-crests" &&
    probe?.positiveControl?.summary?.maxVisibleCrests >= 2 &&
    probe?.positiveControl?.columns?.filter((column) => column.visibleCrestCount >= 2).length >=
      4 &&
    probe?.positiveControl?.summary?.rejectedHorizontalTerraceCandidate === false;
  const reliefTracked = probe?.summary?.meanRelief > 4 && probe?.summary?.maxRelief > 8;

  const hillshade = renderHeightPatch(probe.heightPatch);
  const profiles = renderProfiles(probe.columns);
  const metadata = {
    slice: "04a2a-midground-occlusion-instrument",
    route: `/renderer/battle-terrain-3d?${QUERY}`,
    viewport: VIEWPORT,
    camera: stats?.camera,
    heightSpan: stats?.heightSpan,
    probe,
    verdict:
      "Accepted as an instrument checkpoint only: the geometry probe rejects the current 04A2 metric-green terraces and proves the next sculpt needs real overlapping crests.",
  };

  ctx.check(
    "midground occlusion probe uses the locked reference camera and clay diagnostic route",
    routeLocked,
    JSON.stringify({
      route: stats?.route,
      gate: stats?.gate,
      view: stats?.view,
      camera: stats?.camera,
      groundDiagnostic: stats?.ground?.diagnosticMode,
      grassTechnique: stats?.grassTechnique,
      grassBlades: stats?.grass?.bladeInstances,
    }),
  );
  ctx.check(
    "midground occlusion probe publishes geometry-truth samples",
    probePublished,
    JSON.stringify(probe?.summary ?? null),
  );
  ctx.check(
    "midground occlusion probe tracks meter-scale relief",
    reliefTracked,
    JSON.stringify(probe?.summary ?? null),
  );
  ctx.check(
    "midground occlusion probe rejects the current horizontal-terrace candidate",
    rejectsCurrentTerraces,
    JSON.stringify(probe?.summary ?? null),
  );
  ctx.check(
    "midground occlusion probe accepts a synthetic overlapping-crest positive control",
    positiveControlAccepted,
    JSON.stringify({
      name: probe?.positiveControl?.name,
      summary: probe?.positiveControl?.summary,
      visibleCrestCounts: probe?.positiveControl?.columns?.map(
        (column) => column.visibleCrestCount,
      ),
    }),
  );

  if (process.env.UPDATE_SHOTS === "1") {
    await writeArtifacts({ hillshade, profiles, metadata });
  }

  await ctx.snap(null, "map-reference/midground-occlusion-hillshade", {
    shot: PNG.sync.write(hillshade),
  });
  await ctx.snap(null, "map-reference/midground-occlusion-profiles", {
    shot: PNG.sync.write(profiles),
  });
}

async function writeArtifacts({ hillshade, profiles, metadata }) {
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("hillshade.png", ASSET_DIR), PNG.sync.write(hillshade)),
    writeFile(new URL("profiles.png", ASSET_DIR), PNG.sync.write(profiles)),
    writeFile(
      new URL("midground-occlusion-contract.json", ASSET_DIR),
      `${JSON.stringify(metadata, null, 2)}\n`,
    ),
    writeFile(new URL("decision-note.md", ASSET_DIR), decisionNote(metadata)),
  ]);
}

function decisionNote(metadata) {
  return `# 04A2A midground occlusion instrument

## Verdict

${metadata.verdict}

## Route

- ${metadata.route}
- Camera: ${JSON.stringify(metadata.camera)}
- Height span: ${metadata.heightSpan}

## Summary

${JSON.stringify(metadata.probe.summary, null, 2)}

## Positive control

${JSON.stringify(
  {
    name: metadata.probe.positiveControl.name,
    summary: metadata.probe.positiveControl.summary,
    visibleCrestCounts: metadata.probe.positiveControl.columns.map(
      (column) => column.visibleCrestCount,
    ),
  },
  null,
  2,
)}

## Next

Implement 04A2B against this geometry probe. The current candidate is useful as
a negative control only; 04A2B should update this scene from rejecting the
current terrain to accepting the new sculpt once the real heightfield reaches
the positive-control crest threshold.
`;
}

function renderHeightPatch(patch) {
  const scale = 8;
  const out = new PNG({ width: patch.cols * scale, height: patch.rows * scale });
  const span = Math.max(1e-6, patch.max - patch.min);
  for (let y = 0; y < patch.rows; y++) {
    for (let x = 0; x < patch.cols; x++) {
      const h = heightAtPatch(patch, x, y);
      const hx =
        heightAtPatch(patch, Math.min(patch.cols - 1, x + 1), y) -
        heightAtPatch(patch, Math.max(0, x - 1), y);
      const hy =
        heightAtPatch(patch, x, Math.min(patch.rows - 1, y + 1)) -
        heightAtPatch(patch, x, Math.max(0, y - 1));
      const slopeShade = clamp01(0.58 + hx * 0.045 - hy * 0.06);
      const heightShade = clamp01((h - patch.min) / span);
      const v = Math.round((72 + heightShade * 118) * slopeShade);
      fillRect(out, x * scale, y * scale, scale, scale, [v, v + 8, v + 2, 255]);
    }
  }
  return out;
}

function renderProfiles(columns) {
  const selected = [0, Math.floor(columns.length / 2), columns.length - 1].map((i) => columns[i]);
  const panelW = 420;
  const panelH = 180;
  const gap = 16;
  const out = solidPng(
    panelW * selected.length + gap * (selected.length - 1),
    panelH,
    [224, 228, 224, 255],
  );
  for (let i = 0; i < selected.length; i++) {
    drawProfile(out, selected[i], i * (panelW + gap), 0, panelW, panelH);
  }
  return out;
}

function drawProfile(out, column, ox, oy, w, h) {
  const profile = column.profile;
  const minH = Math.min(...profile.map((p) => p.height));
  const maxH = Math.max(...profile.map((p) => p.height));
  const span = Math.max(1e-6, maxH - minH);
  fillRect(out, ox, oy, w, h, [232, 234, 229, 255]);
  fillRect(out, ox, oy + h - 22, w, 1, [110, 118, 104, 255]);
  let last = null;
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    const x = ox + Math.round((i / (profile.length - 1)) * (w - 1));
    const y = oy + h - 24 - Math.round(((p.height - minH) / span) * (h - 34));
    if (last) drawLine(out, last.x, last.y, x, y, [82, 95, 69, 255]);
    if (p.visible) fillRect(out, x, y - 2, 2, 4, [202, 132, 35, 255]);
    last = { x, y };
  }
  for (const crest of column.crests) {
    const x = ox + Math.round((crest.sample / (profile.length - 1)) * (w - 1));
    const y = oy + h - 24 - Math.round(((crest.height - minH) / span) * (h - 34));
    fillRect(out, x - 3, y - 3, 6, 6, [182, 47, 40, 255]);
  }
}

function heightAtPatch(patch, x, y) {
  return patch.heights[y * patch.cols + x] ?? patch.min;
}

function fillRect(out, x, y, w, h, rgba) {
  for (let yy = Math.max(0, y); yy < Math.min(out.height, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(out.width, x + w); xx++) {
      const i = (yy * out.width + xx) * 4;
      out.data[i] = rgba[0];
      out.data[i + 1] = rgba[1];
      out.data[i + 2] = rgba[2];
      out.data[i + 3] = rgba[3];
    }
  }
}

function drawLine(out, x0, y0, x1, y1, rgba) {
  let dx = Math.abs(x1 - x0);
  let sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    fillRect(out, x0, y0, 2, 2, rgba);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function solidPng(width, height, rgba) {
  const out = new PNG({ width, height });
  fillRect(out, 0, 0, width, height, rgba);
  return out;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
