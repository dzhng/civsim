import { readFileSync } from "node:fs";
import { campaign, campaignPresentationReady } from "../worlds.mjs";

const VIEWPORT = { width: 1280, height: 800 };
const CAMERA = { x: -450, y: 990, zoom: 7.5 };
// Chosen on the settlement body in the committed connected-shelves/alps-close.png
// (1280×800), independently of the renderer's projection/picking implementation.
const CLICK = { x: 1038, y: 425 };
const SOURCE_MAP = JSON.parse(
  readFileSync(new URL("../../public/data/campaign-map.json", import.meta.url), "utf8"),
);
const CITY_INDEX = SOURCE_MAP.nodes.findIndex((node) => node.id === 50013);
const CITY = SOURCE_MAP.nodes[CITY_INDEX];

export const meta = {
  name: "campaign-landscape-interaction",
  kind: "visual",
  world: "campaign-real",
  tier: "full",
  snapshots: [
    "campaign-landscape-interaction-dpr1",
    "campaign-landscape-interaction-dpr2",
    "campaign-density-overview-dpr1",
    "campaign-density-overview-dpr2",
    "campaign-density-regional-dpr1",
    "campaign-density-regional-dpr2",
  ],
  describe:
    "Display density preserves campaign presentation, drag distances and raised-city picking.",
};

export async function run(ctx) {
  if (!CITY || CITY.name !== "Aguntum" || CITY.kind !== "city")
    throw new Error("The committed Aguntum source identity is missing");
  let firstCamera;
  const policyControls = new Map();
  for (const dpr of [1, 2]) {
    const page = await campaign(ctx, "new", {
      viewport: VIEWPORT,
      deviceScaleFactor: dpr,
      errorPrefix: `campaign-landscape-interaction-dpr${dpr}`,
    });
    try {
      await page.evaluate(
        ({ camera, dpr }) => {
          const api = window.__campaign;
          api.freeze(true);
          api.fogOfWar(false);
          api.factionView(false);
          api.select(-1);
          api.cam(camera.x, camera.y, camera.zoom * dpr);
        },
        { camera: CAMERA, dpr },
      );
      await checkDisplayPolicy(ctx, page, dpr, policyControls);
      await page.evaluate(({ x, y, zoom }) => window.__campaign.cam(x, y, zoom), {
        x: CAMERA.x,
        y: CAMERA.y,
        zoom: CAMERA.zoom * dpr,
      });
      await campaignPresentationReady(page);
      const before = await presentedState(page, dpr);
      ctx.check(
        `DPR${dpr}: real Aguntum has a raised presented surface and seated city`,
        before.source.id === CITY.id &&
          before.source.name === CITY.name &&
          before.surface &&
          before.surface.position[2] > 0 &&
          Math.abs(before.cityZ - before.surface.position[2]) < 0.0001,
        JSON.stringify(before),
      );
      const body = before.body;
      ctx.check(
        `DPR${dpr}: committed fixed pixel remains on the visible city body`,
        !!body &&
          CLICK.x >= body.minX &&
          CLICK.x <= body.maxX &&
          CLICK.y >= body.minY &&
          CLICK.y <= body.maxY,
        JSON.stringify({ click: CLICK, body }),
      );
      ctx.check(
        `DPR${dpr}: close camera preserves requested CSS framing`,
        before.cssWidth === VIEWPORT.width &&
          before.cssHeight === VIEWPORT.height &&
          before.cssScale === CAMERA.zoom &&
          before.camera.target[0] === CAMERA.x &&
          before.camera.target[1] === CAMERA.y,
        JSON.stringify(before.camera),
      );
      const camera = {
        pose: before.camera,
        projection: before.projection,
        width: before.cssWidth,
        height: before.cssHeight,
        scale: before.cssScale,
      };
      if (firstCamera)
        ctx.check(
          "DPR2 presents the same world camera as DPR1",
          JSON.stringify(camera) === JSON.stringify(firstCamera),
          JSON.stringify({ firstCamera, camera }),
        );
      else firstCamera = camera;

      // No project()/screenToWorld() result chooses or adjusts this stimulus.
      await page.mouse.click(CLICK.x, CLICK.y);
      await page.waitForFunction(
        ({ name, index }) => {
          const panel = document.querySelector("#cmp-city");
          const title = panel?.querySelector(".cmp-title");
          return (
            panel &&
            panel.getBoundingClientRect().width > 0 &&
            title?.textContent?.trim() === name &&
            window.__campaign.selected() === -1 &&
            window.__campaignGpuStats?.physicalWorld?.selected === String(index)
          );
        },
        { name: CITY.name, index: CITY_INDEX },
        { timeout: 15000 },
      );
      const after = await presentedState(page, dpr);
      ctx.check(
        `DPR${dpr}: fixed city click selects Aguntum through production input`,
        after.selected === String(CITY_INDEX) &&
          after.armySelected === -1 &&
          after.panelTitle === CITY.name &&
          after.selectionCount === 1,
        JSON.stringify({ click: CLICK, source: CITY, before, after }),
      );
      await ctx.snap(page, `campaign-landscape-interaction-dpr${dpr}`, {
        threshold: 0,
        maxDiffRatio: 0,
      });
    } finally {
      await page.close();
    }
  }
}

async function presentedState(page, dpr) {
  return page.evaluate(
    async ({ index, position, dpr }) => {
      const api = window.__campaign;
      const cam = api.camGet();
      api.cam(cam.x, cam.y, cam.scale);
      const renderer = api.rendererOwner();
      const world = renderer.world;
      const revision = world.stats().surfaceRevision;
      await world.world.settlePresentedFrame();
      const stats = renderer.stats();
      if (revision !== world.stats().surfaceRevision || !stats.residency.ready)
        throw new Error("Terrain changed while awaiting the requested presented frame");
      const source = renderer.data.map.nodes[index];
      const city = world.cities.objects.find((object) => object.input.city.id === index);
      return {
        source: { id: source.id, name: source.name },
        surface: world.surface.sampleRendered(...position),
        surfaceRevision: revision,
        cityZ: city?.mesh.position.z,
        body: stats.physicalWorld.cityBodyRects.find((rect) => rect.id === index),
        camera: world.pose,
        projection: world.camera.projectionMatrix.elements.slice(),
        cssWidth: stats.width / dpr,
        cssHeight: stats.height / dpr,
        cssScale: cam.scale / dpr,
        selected: stats.physicalWorld.selected,
        armySelected: api.selected(),
        selectionCount: stats.physicalWorld.selections.selections,
        panelTitle: document.querySelector("#cmp-city .cmp-title")?.textContent?.trim() ?? "",
      };
    },
    { index: CITY_INDEX, position: CITY.pos, dpr },
  );
}

async function checkDisplayPolicy(ctx, page, dpr, controls) {
  const roma = SOURCE_MAP.nodes.findIndex((node) => node.name === "Roma");
  const edge = SOURCE_MAP.edges.findIndex(
    (road) => road.kind === "road" && [road.a, road.b].includes(SOURCE_MAP.nodes[roma].id),
  );
  const armyId = await page.evaluate(() => window.__campaign.armies().find((army) => army.mine).id);
  // Garrisoned stacks have no representative figures. Put the Roman stack on a
  // real road so the density comparison exercises that policy too.
  await page.evaluate(({ armyId, edge, tile }) => window.__campaign.place(armyId, 1, edge, tile), {
    armyId,
    edge,
    tile: Math.floor(SOURCE_MAP.edges[edge].tiles.length / 2),
  });
  // These views straddle scenery and label tiers; the close city alone does not.
  for (const [name, x, y, zoom] of [
    ["overview", -100, 250, 0.3],
    ["city tiers", -430, 445, 0.55],
    ["regional", -430, 445, 3],
  ]) {
    await page.evaluate(
      ({ x, y, scale, political }) => {
        window.__campaign.factionView(political);
        window.__campaign.cam(x, y, scale);
      },
      { x, y, scale: zoom * dpr, political: name !== "regional" },
    );
    await campaignPresentationReady(page);
    const state = await page.evaluate(() => {
      const stats = window.__campaignGpuStats;
      return {
        cards: stats.visibleCardRects.map((card) => card.name).sort(),
        labels: [
          ...stats.visibleCityLabelRects,
          ...stats.visibleArmyLabelRects,
          ...stats.visibleFactionLabelRects,
          ...stats.visibleSeaLabelRects,
        ]
          .map((label) => `${label.kind}:${label.text}`)
          .sort(),
        scenery: stats.physicalWorld.sceneryAnchors.map(({ x, y, kind }) => [x, y, kind]),
        figures: stats.physicalWorld.crowdSeating.map(({ x, y, classId }) => [x, y, classId]),
      };
    });
    ctx.check(`DPR${dpr}: ${name} exercises visible labels`, state.labels.length > 0);
    if (name === "regional")
      ctx.check(
        `DPR${dpr}: regional policy exercises cards, scenery and figures`,
        state.cards.length > 0 && state.scenery.length > 0 && state.figures.length > 0,
        JSON.stringify(
          Object.fromEntries(Object.entries(state).map(([key, value]) => [key, value.length])),
        ),
      );
    if (name !== "city tiers")
      await ctx.snap(page, `campaign-density-${name}-dpr${dpr}`, {
        threshold: 0,
        maxDiffRatio: 0,
        shot: await page.screenshot({ timeout: 180000 }),
      });
    if (dpr === 1) controls.set(name, state);
    else
      for (const key of Object.keys(state)) {
        const expected = controls.get(name)[key];
        ctx.check(
          `${name}: ${key} membership matches at the same CSS zoom`,
          JSON.stringify(state[key]) === JSON.stringify(expected),
          JSON.stringify({ expected: expected.length, actual: state[key].length }),
        );
      }
  }
  const before = await page.evaluate(() => window.__campaign.camGet());
  // This open-sea point is clear of city cards in the fixed regional view.
  await page.mouse.move(100, 400);
  await page.mouse.down();
  await page.mouse.move(140, 420);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__campaign.camGet());
  const delta = [after.x - before.x, after.y - before.y];
  ctx.check(
    `DPR${dpr}: CSS drag moves the chart by the expected world distance`,
    Math.abs(delta[0] + 40 / 3) < 1e-6 && Math.abs(delta[1] - 20 / 3) < 1e-6,
    JSON.stringify(delta),
  );
  await page.evaluate(({ armyId, roma }) => window.__campaign.place(armyId, 0, roma, 0), {
    armyId,
    roma,
  });
}
