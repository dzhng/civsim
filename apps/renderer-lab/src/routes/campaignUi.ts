import { CampaignEntityPass } from "@packages/game-renderer/src/campaign/entityPass";
import { buildCampaignMapDrawData, CampaignLabelPass, CampaignRoadPass, CampaignWorldLinePass } from "@packages/game-renderer/src/campaign/mapPass";
import { SharedStandardPass } from "@packages/game-renderer/src/models/shared/standardPass";
import { CampaignSelectionPass } from "@packages/game-renderer/src/campaign/selectionPass";
import { nearestLoc } from "../../../../web/src/campaign/data";
import { readCampaignViews } from "../../../../web/src/campaign/views";
import { campaignDomHtml, type ArmyRosterRow, type CityDetail, type ClassDoctrineRow, type DiplomacyRow } from "../../../../web/src/campaign/panels";
import { mountCampaignHud } from "../../../../web/src/ui/campaign/CampaignHud";
import { type CampaignTopBarActions, type CampaignTopBarState } from "../../../../web/src/ui/campaign/CampaignTopBar";
import { createHudStore } from "../../../../web/src/ui/hudStore";
import { buildCampaignEntityFrame, campaignArmyLabels, campaignBgTerrainRect, campaignCssToWorld, campaignPick, campaignPresetCamera, loadCampaignUiFixture, publishCampaignUiDebug } from "../labCampaign";
import { type LabContext, LabGroundPass, chartSnapshot, createConfiguredShell, labGroundFramePass, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const [{ default: initWasm, Campaign }, fixture] = await Promise.all([
    import("../../../../web/src/wasm/game_wasm.js"),
    loadCampaignUiFixture(),
  ]);
  const wasm = await initWasm();
  const campaign = new Campaign(fixture.mapJson, 0x5eed_2026, 0);
  const data = fixture.data;
  const preset = ctx.params.get("preset") ?? "fixture";
  const camera = campaignPresetCamera(preset);
  const shell = await createConfiguredShell(ctx.canvas, camera);
  const ground = new LabGroundPass(shell, campaignBgTerrainRect(data.bgRect));
  const lines = new CampaignWorldLinePass(shell, "triangle-list");
  const roads = new CampaignRoadPass(shell);
  const entities = new CampaignEntityPass(shell);
  const standards = new SharedStandardPass(shell);
  const selection = new CampaignSelectionPass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const drawData = buildCampaignMapDrawData(data, { roadScale: 0.78 });
  lines.upload(drawData.lineVertices);
  roads.upload(drawData.roadMeshVertices);
  const host = ctx.canvas.parentElement ?? ctx.root;
  host.querySelector(".renderer-campaign-ui")?.remove();
  const uiRoot = document.createElement("div");
  uiRoot.className = "renderer-campaign-ui";
  uiRoot.innerHTML = campaignDomHtml();
  host.appendChild(uiRoot);
  const noop = () => {};
  const topBarStore = createHudStore<CampaignTopBarState>({
    dateText: "",
    goldText: "",
    paused: true,
    speed: 0,
    factionView: false,
    fog: false,
    diploOpen: true,
    classesOpen: true,
  });
  const topBarActions: CampaignTopBarActions = {
    pause: noop,
    speed: noop,
    factions: noop,
    fog: noop,
    diplomacy: noop,
    classes: noop,
    save: noop,
    exit: noop,
  };
  const campaignHud = mountCampaignHud(
    uiRoot.querySelector("#cmp-hud-root")!,
    topBarStore,
    topBarActions,
  );
  const armyPanel = uiRoot.querySelector("#cmp-army") as HTMLDivElement;
  const cityPanel = uiRoot.querySelector("#cmp-city") as HTMLDivElement;
  const diplomacyPanel = uiRoot.querySelector("#cmp-diplomacy") as HTMLDivElement;
  const classesPanel = uiRoot.querySelector("#cmp-classes") as HTMLDivElement;
  const recruitClasses = JSON.parse(campaign.unit_class_names_json()) as string[];
  let views = readCampaignViews(campaign, wasm);
  let selectedArmy = views.armies.find((army) => army.mine)?.id ?? -1;
  if (selectedArmy >= 0) {
    campaign.debug_place(selectedArmy, 1, 0, 4);
    views = readCampaignViews(campaign, wasm);
  }
  let selectedCity = data.map.nodes.findIndex(
    (node) => node.kind === "city" && node.owner === "rome",
  );
  let lastPick = { kind: "initial", army: selectedArmy, city: selectedCity, worldX: 0, worldY: 0 };

  const draw = (reason = "draw") => {
    views = readCampaignViews(campaign, wasm);
    const entityFrame = buildCampaignEntityFrame(
      data,
      views,
      campaign.player_faction(),
      selectedArmy,
      selectedCity,
    );
    entities.upload(entityFrame.entities);
    standards.upload(entityFrame.standards);
    selection.upload(entityFrame.selections);
    const labels = drawData.labels.concat(campaignArmyLabels(views.armies));
    const labelLayer = labelPass.upload(labels, chartSnapshot(camera, shell));
    shell.drawFrame({
      clear: { r: 0.68, g: 0.72, b: 0.69, a: 1 },
      passes: [
        labGroundFramePass(ground, "campaign-ui-ground"),
        {
          id: "campaign-ui-entities-opaque",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => entities.drawOpaque(pass),
        },
        {
          id: "campaign-ui-standards-opaque",
          role: "world-opaque",
          phase: "world-depth",
          depth: "read-write",
          draw: (pass) => standards.drawOpaque(pass),
        },
        {
          id: "campaign-ui-entity-shadows",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => entities.drawShadows(pass),
        },
        {
          id: "campaign-ui-standard-shadows",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => standards.drawShadows(pass),
        },
        {
          id: "campaign-ui-roads",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => roads.draw(pass),
        },
        {
          id: "campaign-ui-sea-lanes-depth",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => lines.draw(pass),
        },
        {
          id: "campaign-ui-selection",
          role: "world-decal",
          phase: "world-depth",
          depth: "read",
          draw: (pass) => selection.draw(pass),
        },
        {
          id: "campaign-ui-labels",
          role: "overlay-ui",
          phase: "overlay",
          draw: (pass) => labelPass.draw(pass),
        },
      ],
    });
    const tick = campaign.current_tick();
    const day = Math.floor(tick / 1440) + 1;
    const mins = tick % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(Math.floor(mins % 60)).padStart(2, "0");
    topBarStore.set({
      dateText: `Day ${day}, ${hh}:${mm}  PAUSED`,
      goldText: `${campaign.treasury().toLocaleString()} gold`,
      paused: true,
      speed: 0,
      factionView: false,
      fog: false,
      diploOpen: true,
      classesOpen: true,
    });
    const roster =
      selectedArmy < 0
        ? null
        : (JSON.parse(campaign.army_roster_json(selectedArmy)) as ArmyRosterRow[] | null);
    if (selectedArmy < 0 || !roster) {
      campaignHud.setArmy(null);
    } else {
      const armyId = selectedArmy;
      const me = views.armies.find((army) => army.id === armyId);
      campaignHud.setArmy({
        armyId,
        roster,
        me,
        buddy: undefined,
        spotIdx: -1,
        autoReplenish: campaign.army_auto_replenish(armyId),
        onAutoReplenish: (on) => {
          campaign.order_auto_replenish(armyId, on);
          draw("replenish");
        },
        onHalt: noop,
        onAmbush: noop,
        onCamp: noop,
        onSplit: noop,
        onMerge: noop,
      });
    }
    const city = selectedCity < 0 ? undefined : views.cities.get(selectedCity);
    const detail = city
      ? (JSON.parse(campaign.city_json(selectedCity)) as CityDetail | null)
      : null;
    if (!city || !detail) {
      campaignHud.setCity(null);
    } else {
      const node = data.map.nodes[selectedCity];
      campaignHud.setCity({
        name: node.name,
        tier: node.tier,
        factionName: data.map.factions[city.owner]?.name ?? "?",
        garrison: city.garrison,
        queue: city.queue,
        mineCity: city.owner === campaign.player_faction(),
        detail,
        recruitClasses,
        onPolicy: noop,
        onRecruit: noop,
      });
    }
    const diplomacy = JSON.parse(campaign.diplomacy_json()) as DiplomacyRow[];
    campaignHud.setDiplomacy({ list: diplomacy, onAction: noop });
    const classRows = JSON.parse(campaign.class_doctrine_json()) as ClassDoctrineRow[];
    campaignHud.setClasses({
      rows: classRows,
      onSelectUnit: noop,
      onSelectSize: noop,
      onApply: noop,
    });
    const uiStats = {
      armyPanel: armyPanel.style.display !== "none",
      cityPanel: cityPanel.style.display !== "none",
      diplomacyRows: diplomacyPanel.querySelectorAll(".cmp-diplo-row").length,
      classRows: classesPanel.querySelectorAll(".cmp-class-row").length,
      autoReplenishToggle: armyPanel.querySelector("#cmp-auto-replenish") !== null,
      rendererSurfaces: 3,
      domSurfaces: 5,
      postCutoverScreenshots: "renderer-only",
    };
    ctx.status.innerHTML = reportTable({
      route: "campaign-ui",
      fixture: fixture.kind,
      reason,
      armies: views.armies.length,
      cities: views.cities.size,
      selectedArmy,
      selectedCity,
      entities: entityFrame.entities.length,
      standards: entityFrame.standards.length,
      selections: entityFrame.selections.length,
      labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
      panels: `army:${uiStats.armyPanel} city:${uiStats.cityPanel}`,
      renderer: "raw WebGPU campaign entities + retained DOM panels",
    });
    publishCampaignUiDebug(ctx.canvas, camera, views, selectedArmy, selectedCity, lastPick);
    publish("campaign-ui", true, {
      fixture: fixture.kind,
      camera,
      armies: views.armies.length,
      cities: views.cities.size,
      playerArmies: views.armies.filter((army) => army.mine).length,
      selectedArmy,
      selectedCity,
      labels: labelLayer.labels,
      visibleLabels: labelLayer.visibleLabels,
      entities: entityFrame.entities.length,
      cityEntities: entityFrame.cityEntities,
      armyEntities: entityFrame.armyEntities,
      standards: entityFrame.standards.length,
      standardLayer: standards.stats().layer,
      selections: entityFrame.selections.length,
      lastPick,
      ui: uiStats,
      lineSegments: lines.stats().segments,
      roadTriangles: roads.stats().triangles,
      labelLayer: labelLayer.layer,
      labelAtlas: `${labelLayer.atlasWidth}x${labelLayer.atlasHeight}`,
      labelVertices: labelLayer.vertices,
      depth: shell.stats().depth,
      framePhases: shell.stats().phases,
      postCutoverScreenshots: "renderer-only",
    });
  };

  ctx.canvas.addEventListener("click", (event) => {
    const hit = campaignPick(
      event.clientX,
      event.clientY,
      ctx.canvas,
      camera,
      shell.stats(),
      data,
      views,
    );
    selectedArmy = hit.army;
    if (hit.army >= 0) selectedCity = -1;
    else selectedCity = hit.city;
    lastPick = {
      kind: hit.kind,
      army: hit.army,
      city: hit.city,
      worldX: hit.worldX,
      worldY: hit.worldY,
    };
    draw("click");
  });
  ctx.canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (selectedArmy < 0) return;
    const world = campaignCssToWorld(
      event.clientX,
      event.clientY,
      ctx.canvas,
      camera,
      shell.stats(),
    );
    const loc = nearestLoc(data.map, world.x, world.y, 60 / camera.zoom);
    if (loc) campaign.order_move(selectedArmy, loc.kind, loc.a, loc.b);
    draw("order");
  });

  draw();
}
