import { campaignCrowdFixture } from "./campaignCrowdFixture";
import type { CampaignLabel } from "@packages/game-renderer/src/campaign/labelFrame";
import type { CampaignEntityInstance } from "@packages/game-renderer/src/campaign/entityInstance";
import { smoothstep } from "@packages/renderer-core/src/math";
import type { SceneryInstance } from "@packages/game-renderer/src/terrain/scenery";
import { PhotorealCampaignWorld } from "@packages/photoreal-renderer/src/campaign/campaignWorld";
import { createRenderedSurface } from "@packages/game-renderer/src/terrain/surface";
import { buildCampaignMapDrawData } from "@packages/game-renderer/src/campaign/roadGeometry";
import { buildCityMesh } from "@packages/game-renderer/src/models/campaign/campaignEntityModels";
import { MeshBuilder } from "@packages/game-renderer/src/models/shared/meshBuilder";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import { type LabContext, publish } from "../labShell";

export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  let glyphsVisible = true;
  let blockedRects: { x: number; y: number; w: number; h: number }[] = [];
  const glyphLabels = ctx.params.get("labels") === "1";
  if (glyphLabels) await document.fonts.load("600 15px Cinzel");
  const geography = ctx.params.get("geography") === "1";
  const vegetation = ctx.path === "/renderer/landscape-vegetation";
  const size = 81,
    cell = 2,
    vertices = new Float32Array(size * size * 10),
    indices = new Uint32Array((size - 1) ** 2 * 6);
  const surfaceColor = new Float32Array(size * size * 3);
  const height = (x: number, y: number) =>
    4 +
    (ctx.params.get("ridge") === "0" ? 0 : 27) *
      Math.exp(-((y / 10) ** 2)) *
      Math.exp(-((x / 48) ** 2)) +
    8 / (1 + Math.exp(-x / 12));
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const k = j * size + i,
        x = -80 + i * cell,
        y = -80 + j * cell;
      const dx = (height(x + 1, y) - height(x - 1, y)) / 2,
        dy = (height(x, y + 1) - height(x, y - 1)) / 2,
        l = Math.hypot(dx, dy, 1);
      vertices.set([x, y, height(x, y), -dx / l, -dy / l, 1 / l, 0.57, 0.61, 0.32, 0], k * 10);
      surfaceColor.set([0.57, 0.61, 0.32], k * 3);
      if (i < size - 1 && j < size - 1)
        indices.set([k, k + size, k + 1, k + 1, k + size, k + size + 1], (j * (size - 1) + i) * 6);
    }
  const surface = createRenderedSurface(
    {
      vertices,
      indices,
      surfaceColor,
      tint: new Float32Array(size * size),
      triangles: indices.length / 3,
    },
    { ox: -80, oy: -80, columns: size, rows: size, cell, units: "kilometers" },
    "composition-fixture",
  );
  const roadData = {
    map: {
      nodes: [],
      factions: [],
      edges: [
        {
          kind: "road" as const,
          via: [
            [-30, 24],
            [30, 24],
          ] as [number, number][],
        },
        {
          kind: "road" as const,
          via: [
            [-60, -35],
            [-30, -25],
            [10, -20],
            [35, -25],
            [40, 45],
          ] as [number, number][],
        },
      ],
    },
  };
  const roads = buildCampaignMapDrawData(roadData);
  const builder = new MeshBuilder();
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 3; i++)
      builder.box([(i - 1) * 1.4, (j - 0.5) * 1.5, 0.9], [0.8, 0.8, 1.8], [0.18, 0.36, 0.78], 1);
  const army = builder.finish("composition army marker");
  const composition = {
    surface,
    geography: { ...roads, borderVertices: new Float32Array() },
    territory: [0.75, 0.36, 0.26] as const,
    objects: [
      {
        id: "city",
        standardBase: 4.94,
        x: -35,
        y: -32,
        scale: 1.8,
        model: buildCityMesh(),
        label: "Ridge settlement",
        faction: "crimson" as const,
      },
      {
        id: "army",
        x: 35,
        y: -25,
        scale: 2,
        model: army,
        label: "Field army",
        faction: "azure" as const,
      },
      {
        id: "rear",
        x: 0,
        y: 24,
        scale: 2,
        model: army,
        label: "Rear army",
        faction: "azure" as const,
      },
    ],
    fogAt: (x: number) => Math.max(0, Math.min(1, (x - 10) / 15)),
  };
  const cities: CampaignEntityInstance[] =
    ctx.params.get("cities") === "1"
      ? [
          {
            id: 0,
            label: "Hillside town",
            x: -20,
            y: -11,
            radius: 6.2,
            kind: "city",
            selected: true,
            faction: [0.72, 0.2, 0.14],
            allegiance: [0.18, 0.7, 0.26],
          },
          {
            id: 1,
            label: "Valley town",
            x: 25,
            y: -28,
            radius: 5.2,
            kind: "city",
            selected: false,
            faction: [0.18, 0.3, 0.72],
            allegiance: [0.88, 0.27, 0.23],
          },
        ]
      : [];
  if (vegetation || cities.length) composition.objects = [];
  const scenery: SceneryInstance[] = vegetation
    ? [
        { x: 35, y: -25, size: 4, height: 4, kind: "broadleaf" },
        { x: 25, y: -38, size: 3, height: 4, kind: "conifer" },
        { x: 42, y: -40, size: 3, height: 3.5, kind: "ash" },
        { x: 55, y: -24, size: 3, height: 4, kind: "aspen" },
        { x: -30, y: -25, size: 4, height: 3, kind: "broadleaf" },
        { x: -40, y: -40, size: 2, height: 1, kind: "bush" },
      ]
    : geography
      ? [
          { x: 25, y: -38, size: 3, height: 4, kind: "conifer" as const },
          { x: -40, y: -40, size: 3, height: 4, kind: "broadleaf" as const },
        ]
      : [];
  const crowdFixture = ctx.params.get("crowd") === "1" ? await campaignCrowdFixture(surface) : null;
  if (crowdFixture) composition.objects = [];
  const physicalComposition = { ...composition, appearances: crowdFixture?.appearances };
  let world = await PhotorealCampaignWorld.create(ctx.canvas, physicalComposition);
  if (cities.length) world.setCities(cities);
  if (crowdFixture) world.setCrowd(crowdFixture.frame().crowd);
  if (vegetation) world.setScenery(scenery);
  const territory = {
    width: 2,
    height: 2,
    // Asymmetric ownership makes either axis reversal visible.
    rgba: new Uint8Array([180, 45, 35, 255, 40, 70, 200, 255, 50, 150, 65, 255, 0, 0, 0, 0]),
    rect: { min: [-80, -80] as [number, number], max: [80, 80] as [number, number] },
  };
  if (geography) world.setScenery(scenery);
  const labels = document.createElement("div");
  labels.style.cssText = "position:absolute;inset:0;pointer-events:none";
  ctx.canvas.parentElement!.append(labels);
  const controls = document.createElement("div");
  controls.style.cssText = "position:absolute;left:16px;top:16px;display:flex;gap:8px";
  const fog = document.createElement("button");
  fog.textContent = "Toggle fog";
  fog.id = "composition-fog";
  const reset = document.createElement("button");
  reset.textContent = "Recreate world";
  reset.id = "composition-reset";
  controls.append(fog, reset);
  ctx.canvas.parentElement!.append(controls);
  let fogEnabled = false,
    alive = true,
    generation = 0,
    rebuilding = false;
  const draw = () => {
    if (!alive || rebuilding) return;
    const width = ctx.canvas.clientWidth,
      height = ctx.canvas.clientHeight;
    const pose = chartCamera3d({ x: 6, y: -3, zoom: 5, pitch: 0.9 }, height);
    pose.aspect = width / height;
    pose.target = [6, -3, 8];
    if (glyphLabels) {
      const inputs: CampaignLabel[] = [
        ...composition.objects.map((object) => ({
          text: object.label,
          x: object.x,
          y: object.y,
          kind: object.id === "city" ? ("city" as const) : ("army" as const),
          size: 15,
          priority: 3,
          screenOffsetY: 18,
          screenAnchorY: "top" as const,
        })),
        ...cities.map((city) => ({
          text: city.label,
          x: city.x,
          y: city.y,
          kind: "city" as const,
          size: 15,
          priority: 3,
          icon: "city" as const,
        })),
      ];
      world.setLabels(glyphsVisible ? inputs : [], {
        renderSurfaceAt: () => "land",
        blockedRects,
      });
    }
    world.render(pose, width, height, window.devicePixelRatio);
    labels.replaceChildren();
    for (const anchor of glyphLabels ? [] : world.anchors()) {
      if (!anchor.visible) continue;
      const label = document.createElement("span");
      label.dataset.entity = anchor.id;
      label.textContent = anchor.selected ? `${anchor.label} · Selected` : anchor.label;
      label.style.cssText = `position:absolute;left:${anchor.x}px;top:${(anchor.y ?? 0) - 8}px;transform:translate(-50%,-100%);font:15px Georgia,serif;color:#fff0c3;text-shadow:0 2px 3px #211b10;white-space:nowrap`;
      if (anchor.selected)
        label.style.cssText +=
          ";padding:5px 9px;background:#e5d5af;color:#302b1f;text-shadow:none;border:1px solid #8a7247";
      labels.append(label);
    }
    publish("campaign-composition", true, {
      ...world.stats(),
      anchors: world.anchors(),
      generation,
    });
  };
  const click = (event: MouseEvent) => {
    const rect = ctx.canvas.getBoundingClientRect();
    world.select(world.pick(event.clientX - rect.left, event.clientY - rect.top));
    draw();
  };
  ctx.canvas.addEventListener("click", click);
  fog.onclick = () => {
    fogEnabled = !fogEnabled;
    world.setFog(fogEnabled);
    draw();
  };
  reset.onclick = async () => {
    reset.disabled = true;
    rebuilding = true;
    world.dispose();
    world = await PhotorealCampaignWorld.create(ctx.canvas, physicalComposition);
    if (cities.length) world.setCities(cities);
    if (crowdFixture) world.setCrowd(crowdFixture.frame().crowd);
    if (!alive) {
      world.dispose();
      return;
    }
    if (vegetation || geography) world.setScenery(scenery);
    world.setFog(fogEnabled);
    generation++;
    reset.disabled = false;
    rebuilding = false;
    draw();
    requestAnimationFrame(draw);
  };
  let tileKey: string | null = null;
  const installDetail = (raised: boolean) => {
    const ox = raised ? 0 : -80,
      oy = -80,
      columns = 81;
    const vertices = new Float32Array(columns * columns * 10);
    const colors = new Float32Array(columns * columns * 3);
    const indices = new Uint32Array(80 * 80 * 6);
    const h = (x: number, y: number) =>
      surface.sampleRendered(Math.max(-80, Math.min(80, x)), Math.max(-80, Math.min(80, y)))!
        .position[2] + (raised ? 8 * Math.exp(-((x - 35) ** 2 + (y + 25) ** 2) / 400) : 0);
    for (let j = 0; j < columns; j++)
      for (let i = 0; i < columns; i++) {
        const k = j * columns + i,
          x = ox + i,
          y = oy + j;
        const dx = (h(x + 1, y) - h(x - 1, y)) / 2,
          dy = (h(x, y + 1) - h(x, y - 1)) / 2,
          length = Math.hypot(dx, dy, 1);
        vertices.set(
          [x, y, h(x, y), -dx / length, -dy / length, 1 / length, 0.57, 0.61, 0.32, 0],
          k * 10,
        );
        colors.set([0.57, 0.61, 0.32], k * 3);
        if (i < 80 && j < 80)
          indices.set(
            [k, k + columns, k + 1, k + 1, k + columns, k + columns + 1],
            (j * 80 + i) * 6,
          );
      }
    const key = raised ? "raised-army" : "left-detail";
    world.installTerrain(
      {
        request: { key, minX: ox, minY: oy, size: 80, cell: 1 },
        domain: { ox, oy, columns, rows: columns, cell: 1, units: "kilometers" },
        mesh: {
          vertices,
          indices,
          surfaceColor: colors,
          tint: new Float32Array(columns * columns),
          triangles: indices.length / 3,
        },
      },
      tileKey ? [tileKey] : [],
    );
    tileKey = key;
    draw();
    requestAnimationFrame(draw);
  };
  Object.assign(window, {
    __campaignComposition: {
      glyphs: (visible: boolean) => {
        glyphsVisible = visible;
        draw();
      },
      blockers: (rects: typeof blockedRects) => {
        blockedRects = rects;
        draw();
      },
      installDetail,
      crowd: (zoom = 5, empty = false, time = 0.25) => {
        if (crowdFixture) world.setCrowd(crowdFixture.frame(zoom, empty, time).crowd);
        draw();
        requestAnimationFrame(draw);
      },
      draw,
      ownership: (enabled: boolean, changed = false) => {
        const rgba = territory.rgba.slice();
        if (changed) rgba.set([185, 135, 30, 255], 8);
        world.setTerritory({ ...territory, rgba }, enabled);
        draw();
        requestAnimationFrame(draw);
      },
      visibility: (east: boolean) => {
        fogEnabled = true;
        const cx = east ? 35 : -35;
        world.setVisibility((x, y) => {
          const distance = Math.hypot(x - cx, y + 30);
          return smoothstep(35 * 0.72, 35 * 1.08, distance);
        }, true);
        draw();
        requestAnimationFrame(draw);
      },
      resubmitScenery: () => {
        world.setScenery([...scenery]);
        draw();
      },
      growScenery: () => {
        world.setScenery([...scenery, { x: -55, y: -25, size: 4, height: 4, kind: "broadleaf" }]);
        draw();
      },
    },
  });
  if (ctx.path === "/renderer/campaign-tile-anchors" || vegetation) {
    for (const [label, raised] of [
      ["Load raised detail", true],
      ["Evict raised detail", false],
    ] as const) {
      const button = document.createElement("button");
      button.textContent = label;
      button.onclick = () => installDetail(raised);
      controls.append(button);
    }
  }
  window.addEventListener("resize", draw);
  draw();
  requestAnimationFrame(draw);
  window.addEventListener(
    "pagehide",
    () => {
      alive = false;
      window.removeEventListener("resize", draw);
      ctx.canvas.removeEventListener("click", click);
      world.dispose();
      labels.remove();
      controls.remove();
    },
    { once: true },
  );
}
