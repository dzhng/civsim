import { route as routeLandscapeStandards } from "./routes/landscapeStandards";
import { route as routeSceneryNormals } from "./routes/sceneryNormals";
import { route as routeLandscapeMaterials } from "./routes/landscapeMaterials";
import { route as routeLandscapeShores } from "./routes/landscapeShores";
import { route as routeLandscapeTraversal } from "./routes/landscapeTraversal";
import { route as routeLandscapeTiles } from "./routes/landscapeTiles";
import { route as routeLandscapeTreeLod } from "./routes/landscapeTreeLod";
import { gpuFailureMessage } from "@packages/renderer-core/src/device";
import { route as routePhotorealCrowd } from "./routes/photorealCrowd";
import { route as routePhotorealPbr } from "./routes/photorealPbr";
import { route as routePhotorealBattle } from "./routes/photorealBattle";
import { route as routeBattleModels } from "./routes/battleModels";
import { route as routeBlenderReference } from "./routes/blenderReference";
import { route as routeBattleGroundTurf } from "./routes/battleGroundTurf";
import { type LabRoute, el } from "./labShell";
import { route as routeDevice } from "./routes/device";
import { route as routeBladeField } from "./routes/bladeField";
import { route as routeBattleElevation } from "./routes/battleElevation";
import { route as routeLodTiers } from "./routes/lodTiers";
import { route as routeMountedUnits } from "./routes/mountedUnits";
import { route as routeSoldierMaterials } from "./routes/soldierMaterials";
import { route as routePerClassAnimation } from "./routes/perClassAnimation";
import { route as routeCapabilities } from "./routes/capabilities";
import { route as routeFaultInjection } from "./routes/faultInjection";
import { route as routeFrameShell } from "./routes/frameShell";
import { route as routeCrowdData } from "./routes/crowdData";
import { route as routeAnimationState } from "./routes/animationState";
import { route as routeSkinnedSoldier } from "./routes/skinnedSoldier";
import { route as routeSkinnedCrowd } from "./routes/skinnedCrowd";
import { route as routeSkinnedDepth } from "./routes/skinnedDepth";
import { route as routeLod } from "./routes/lod";
import { route as routeBattle } from "./routes/battle";
import { route as routeTerrainWater } from "./routes/terrainWater";
import { route as routeCampaignLandscape } from "./routes/campaignLandscape";
import { route as routeCampaignComposition } from "./routes/campaignComposition";
import { route as routeCampaignMap } from "./routes/campaignMap";
import { route as routeCampaignUi } from "./routes/campaignUi";
import { route as routeCampaignModelShots } from "./routes/campaignModels";
import { route as routeSharedPropModelShots } from "./routes/sharedPropModels";
import { route as routeSharedStandardModelShots } from "./routes/sharedStandardModels";
import { route as routeWorldCamera } from "./routes/worldCamera";
import { route as routeCardBar } from "./routes/cardBar";

const routes: Record<string, LabRoute> = {
  "/renderer/device": routeDevice,
  "/renderer/capabilities": routeCapabilities,
  "/renderer/per-class-animation": routePerClassAnimation,
  "/renderer/soldier-materials": routeSoldierMaterials,
  "/renderer/mounted-units": routeMountedUnits,
  "/renderer/lod-tiers": routeLodTiers,
  "/renderer/battle-elevation": routeBattleElevation,
  "/renderer/fault-injection": routeFaultInjection,
  "/renderer/frame-shell": routeFrameShell,
  "/renderer/crowd-data": routeCrowdData,
  "/renderer/animation-state": routeAnimationState,
  "/renderer/skinned-soldier": routeSkinnedSoldier,
  "/renderer/skinned-crowd": routeSkinnedCrowd,
  "/renderer/skinned-depth": routeSkinnedDepth,
  "/renderer/lod": routeLod,
  "/renderer/battle": routeBattle,
  "/renderer/campaign-map": routeCampaignMap,
  "/renderer/campaign-composition": routeCampaignComposition,
  "/renderer/campaign-tile-anchors": routeCampaignComposition,
  "/renderer/landscape-vegetation": routeCampaignComposition,
  "/renderer/scenery-normals": routeSceneryNormals,
  "/renderer/landscape-tree-lod": routeLandscapeTreeLod,
  "/renderer/campaign-landscape": routeCampaignLandscape,
  "/renderer/landscape-shores": routeLandscapeShores,
  "/renderer/landscape-surface": routeCampaignLandscape,
  "/renderer/landscape-materials": routeLandscapeMaterials,
  "/renderer/landscape-traversal": routeLandscapeTraversal,
  "/renderer/landscape-geography": routeLandscapeTraversal,
  "/renderer/landscape-tiles": routeLandscapeTiles,
  "/renderer/terrain-water": routeTerrainWater,
  "/renderer/campaign-ui": routeCampaignUi,
  "/renderer/campaign-models": routeCampaignModelShots,
  "/renderer/shared-prop-models": routeSharedPropModelShots,
  "/renderer/landscape-standards": routeLandscapeStandards,
  "/renderer/shared-standard-models": routeSharedStandardModelShots,
  "/renderer/world-camera": routeWorldCamera,
  "/renderer/card-bar": routeCardBar,
  // The photoreal ladder uses three.js WebGPU + TSL on the camera3d spine.
  "/renderer/photoreal-pbr": routePhotorealPbr,
  "/renderer/photoreal-crowd": routePhotorealCrowd,
  "/renderer/photoreal-battle": routePhotorealBattle,
  "/renderer/battle-models": routeBattleModels,
  "/renderer/blender-reference": routeBlenderReference,
  "/renderer/battle-ground-turf": routeBattleGroundTurf,
  "/renderer/blade-field": routeBladeField,
};

export async function mountRendererLab(path = location.pathname) {
  document.body.innerHTML = "";
  document.body.className = "renderer-lab-body";
  installStyles();
  const root = el("main", "renderer-lab");
  const nav = el("nav", "renderer-lab-nav");
  for (const key of Object.keys(routes)) {
    const a = document.createElement("a");
    a.href = key;
    a.textContent = key.replace("/renderer/", "");
    a.className = key === path ? "active" : "";
    nav.appendChild(a);
  }
  const stage = el("section", "renderer-stage");
  const canvas = document.createElement("canvas");
  canvas.id = "renderer-canvas";
  const panel = el("aside", "renderer-panel");
  const status = el("div", "renderer-status");
  panel.appendChild(status);
  stage.append(canvas, panel);
  root.append(nav, stage);
  document.body.appendChild(root);
  const route = routes[path] ?? routeDevice;
  try {
    await route({
      root,
      canvas,
      panel,
      status,
      path,
      params: new URLSearchParams(location.search),
    });
  } catch (error) {
    status.textContent = gpuFailureMessage(error);
    status.classList.add("bad");
    (
      window as unknown as { __rendererLabReady?: boolean; __rendererLabStats?: unknown }
    ).__rendererLabReady = true;
    (window as unknown as { __rendererLabStats?: unknown }).__rendererLabStats = {
      ok: false,
      error: String(error),
    };
  }
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `
    html, body { margin: 0; height: 100%; overflow: hidden; background: #15161a; color: #e6dcc8; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    .renderer-lab { height: 100vh; display: grid; grid-template-rows: 42px 1fr; }
    .renderer-lab.reference-shot { grid-template-rows: 1fr; }
    .renderer-lab.reference-shot .renderer-lab-nav, .renderer-lab.reference-shot .renderer-panel { display: none; }
    .renderer-lab.reference-shot .renderer-stage { grid-template-columns: 1fr; height: 100vh; max-height: 100vh; overflow: hidden; }
    .renderer-lab.reference-shot #renderer-canvas { height: 100vh; max-height: 100vh; }
    .renderer-lab-nav { display: flex; align-items: center; gap: 4px; overflow-x: auto; padding: 5px 8px; background: #242018; border-bottom: 1px solid #4d4432; }
    .renderer-lab-nav a { color: #c9bea5; text-decoration: none; font-size: 12px; padding: 6px 8px; border-radius: 4px; white-space: nowrap; }
    .renderer-lab-nav a.active, .renderer-lab-nav a:hover { background: #5b4e34; color: #fff7df; }
    .renderer-stage { min-height: 0; display: grid; grid-template-columns: 1fr 310px; position: relative; }
    #renderer-canvas { width: 100%; height: 100%; display: block; background: #aebfcf; }
    .renderer-panel { overflow: auto; border-left: 1px solid #4d4432; background: #191916; padding: 12px; color: #ded3bc; }
    .renderer-panel table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .renderer-panel th, .renderer-panel td { text-align: left; border-bottom: 1px solid #373228; padding: 5px 4px; vertical-align: top; }
    .renderer-panel th { width: 38%; color: #bcae8d; font-weight: 600; }
    .renderer-panel ol { padding-left: 20px; font-size: 12px; line-height: 1.45; }
    .renderer-panel .gpu-graph li { margin: 0 0 6px; }
    .renderer-panel .gpu-graph span { color: #cfc2a8; }
    .renderer-panel .renderer-status-list { list-style: none; padding-left: 0; }
    .renderer-panel .renderer-status-list li { margin: 0 0 8px; padding: 7px 8px; border: 1px solid #373228; border-radius: 5px; background: rgba(255,255,255,0.03); }
    .renderer-panel .renderer-status-list b { display: block; color: #f0dfb4; }
    .renderer-panel .renderer-status-list em { display: inline-block; margin: 3px 0; font-style: normal; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #e8d7a8; }
    .renderer-panel .renderer-status-list span { display: block; color: #cfc2a8; }
    .renderer-panel .renderer-status-list .pending { border-color: #7c6444; background: rgba(164,123,70,0.11); }
    .renderer-status.bad { color: #ffb2a2; }
    .fault-intro { margin: 0 0 10px; color: #bdb29b; font-size: 12px; line-height: 1.4; }
    .fault-controls { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }
    .fault-button { border: 1px solid #7c5d3a; border-radius: 5px; background: #2c2418; color: #f2e3bd; padding: 7px 10px; font-size: 12px; cursor: pointer; }
    .fault-button:hover { background: #41331f; }
    /* Same fixed-size, shrink-wrapping, no-scroll grid as the live #unitcards
       (unitCard.ts writes --cols/--card-w/--card-h). */
    .renderer-unitcards { position: absolute; bottom: 58px; left: 50%; transform: translateX(-50%); display: grid; width: max-content; max-width: calc(100% - 36px); grid-template-columns: repeat(var(--cols, 1), var(--card-w, 72px)); grid-auto-rows: var(--card-h, 96px); gap: 3px; justify-content: center; align-content: end; overflow: hidden; padding: 11px 12px; pointer-events: auto; background: radial-gradient(circle at 9px 9px, rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at calc(100% - 9px) 9px, rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at 9px calc(100% - 9px), rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, radial-gradient(circle at calc(100% - 9px) calc(100% - 9px), rgba(234,204,142,0.95) 0 1.1px, rgba(58,42,22,0.95) 1.5px 2.7px, transparent 3.1px) padding-box, repeating-linear-gradient(96deg, rgba(255,228,168,0.035) 0 2px, rgba(0,0,0,0.04) 2px 4px) padding-box, linear-gradient(#5e4527, #2a1f11) padding-box, linear-gradient(#c79a54 0%, #6e5128 48%, #241a0e 100%) border-box; border: 4px solid transparent; border-radius: 5px; box-shadow: inset 0 1px 0 rgba(236,200,132,0.65), inset 0 0 0 2px rgba(16,10,5,0.78), inset 0 0 0 3px rgba(158,120,66,0.55), inset 0 -3px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(182,142,80,0.65), 0 9px 24px rgba(0,0,0,0.68); }
	    .renderer-campaign-ui { position: absolute; inset: 0 310px 0 0; pointer-events: none; color: #eadfca; font: 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
	    .renderer-campaign-hud { position: absolute; left: 12px; top: 12px; display: flex; align-items: center; gap: 12px; padding: 8px 10px; background: rgba(18,17,14,0.78); border: 1px solid rgba(177,143,82,0.45); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.32); }
	    .renderer-campaign-hud b { color: #f4dfaa; font-family: Cinzel, Georgia, serif; }
	    /* Lab LAYOUT only: the bronze panel MATERIAL is owned by campaignDomHtml's
	     * .cmp-panel rules (the same chrome as the game). The fixture pins panels
	     * absolutely inside its box so they never cover the canvas click targets
	     * (the game positions them fixed to the viewport). */
	    .renderer-campaign-ui .renderer-campaign-panel { position: absolute; pointer-events: auto; width: 250px; max-height: calc(100% - 76px); overflow: auto; }
	    .renderer-campaign-ui .renderer-campaign-panel.army { right: 12px; top: 54px; left: auto; bottom: auto; }
	    .renderer-campaign-ui .renderer-campaign-panel.city { right: 12px; bottom: 12px; left: auto; top: auto; }
	    .renderer-campaign-ui .renderer-campaign-panel.diplomacy { left: 12px; top: 54px; right: auto; bottom: auto; width: 310px; }
	    .renderer-campaign-ui .renderer-campaign-panel.classes { left: 12px; bottom: 12px; right: auto; top: auto; width: 250px; max-height: min(34%, 180px); }
	    .renderer-campaign-panel b { font-family: Cinzel, Georgia, serif; letter-spacing: 0.2px; color: #f1dfb1; }
	    .renderer-campaign-panel .cmp-title { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
	    .renderer-campaign-panel .cmp-ico { width: 14px; height: 14px; fill: currentColor; color: #caa45c; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.35)); }
	    .renderer-campaign-panel .cmp-diplo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 5px 0; padding: 6px; border-radius: 3px; background: rgba(255,255,255,0.05); }
	    .renderer-campaign-panel .cmp-swatch { width: 12px; height: 12px; border-radius: 2px; flex: none; box-shadow: 0 0 0 1px rgba(0,0,0,0.4); }
	    .renderer-campaign-panel .cmp-rel { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 1px 5px; border-radius: 2px; }
	    .renderer-campaign-panel .cmp-rel.war { background: #5a2330; color: #ff9a8a; }
	    .renderer-campaign-panel .cmp-rel.peace { background: #2a3a4a; color: #9ec5e8; }
	    .renderer-campaign-panel .cmp-rel.alliance { background: #2a4a32; color: #9ee8a8; }
	    .renderer-campaign-panel .cmp-pow { opacity: 0.72; font-size: 11px; }
	    .renderer-campaign-panel .cmp-diplo-acts { display: flex; gap: 4px; margin-top: 2px; flex-wrap: wrap; flex-basis: 100%; }
	    .renderer-campaign-panel .cmp-class-row { display: grid; grid-template-columns: 1fr; gap: 7px; padding: 9px 0; border-top: 1px solid rgba(169,133,76,0.3); }
	    .renderer-campaign-panel .cmp-class-name { font-family: Cinzel, Georgia, serif; font-weight: 700; color: #f0dcab; }
	    .renderer-campaign-panel .cmp-class-meta, .renderer-campaign-panel .cmp-city-meta { color: #b9aa8b; font-size: 11px; line-height: 1.25; }
	    .renderer-campaign-panel .cmp-unit-options { display: flex; flex-direction: column; gap: 4px; }
	    .renderer-campaign-panel .cmp-unit { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; background: rgba(42,36,28,0.84); padding: 6px; border: 1px solid rgba(119,94,55,0.35); border-radius: 3px; }
	    .renderer-campaign-panel .cmp-unit.sel { background: rgba(81,64,37,0.96); border-color: rgba(194,154,82,0.72); }
	    .renderer-campaign-panel .cmp-size, .renderer-campaign-panel .cmp-recruits, .renderer-campaign-panel .cmp-build-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px; }
	    @media (max-width: 760px) {
	      .renderer-stage { grid-template-columns: 1fr; grid-template-rows: 1fr 220px; }
	      .renderer-panel { border-left: 0; border-top: 1px solid #4d4432; }
	      .renderer-campaign-ui { inset: 0 0 220px 0; }
	      .renderer-campaign-panel.classes, .renderer-campaign-panel.diplomacy { display: none !important; }
      .renderer-unitcards { left: 12px; right: 12px; justify-content: flex-start; }
    }
  `;
  document.head.appendChild(style);
}
