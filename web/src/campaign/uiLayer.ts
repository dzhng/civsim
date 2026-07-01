import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { Campaign } from "../wasm/game_wasm.js";
import type { CampaignData } from "./data";
import type { ArmyRosterRow, CityDetail, ClassDoctrineRow, DiplomacyRow } from "./panels";
import type { ArmyView, CityView } from "./views";
import { ArmyPanel } from "../ui/campaign/ArmyPanel";
import { CityPanel } from "../ui/campaign/CityPanel";
import { DiplomacyPanel } from "../ui/campaign/DiplomacyPanel";
import { ClassBuilder } from "../ui/campaign/ClassBuilder";

export interface CampaignUiModel {
  campaign: Campaign;
  data: CampaignData;
  armies: ArmyView[];
  cities: Map<number, CityView>;
  selectedArmy: number;
  selectedCity: number;
  treasury: number;
  tick: number;
  recruitClasses: string[];
  diplomacyOpen: boolean;
  classBuilderOpen: boolean;
}

const NOOP = () => {};

// Renderer-lab campaign UI demo. Renders the SAME React panel components as the
// live campaign scene (one source — the HTML builders are gone); the demo just
// feeds snapshot data and no-op action handlers.
export class CampaignUiLayer {
  private root: HTMLDivElement;
  private armyPanel: HTMLDivElement;
  private cityPanel: HTMLDivElement;
  private diplomacyPanel: HTMLDivElement;
  private classesPanel: HTMLDivElement;
  private hud: HTMLDivElement;
  private armyRoot: Root;
  private cityRoot: Root;
  private diploRoot: Root;
  private classesRoot: Root;

  constructor(
    host: HTMLElement,
    private onAutoReplenish?: (army: number, on: boolean) => void,
  ) {
    host.querySelector(".renderer-campaign-ui")?.remove();
    this.root = document.createElement("div");
    this.root.className = "renderer-campaign-ui";
    this.root.innerHTML = `
      <div class="renderer-campaign-hud"></div>
      <div class="renderer-campaign-panel army"></div>
      <div class="renderer-campaign-panel city"></div>
      <div class="renderer-campaign-panel diplomacy"></div>
      <div class="renderer-campaign-panel classes"></div>`;
    host.appendChild(this.root);
    this.hud = this.root.querySelector(".renderer-campaign-hud") as HTMLDivElement;
    this.armyPanel = this.root.querySelector(".renderer-campaign-panel.army") as HTMLDivElement;
    this.cityPanel = this.root.querySelector(".renderer-campaign-panel.city") as HTMLDivElement;
    this.diplomacyPanel = this.root.querySelector(
      ".renderer-campaign-panel.diplomacy",
    ) as HTMLDivElement;
    this.classesPanel = this.root.querySelector(
      ".renderer-campaign-panel.classes",
    ) as HTMLDivElement;
    this.armyRoot = createRoot(this.armyPanel);
    this.cityRoot = createRoot(this.cityPanel);
    this.diploRoot = createRoot(this.diplomacyPanel);
    this.classesRoot = createRoot(this.classesPanel);
  }

  render(model: CampaignUiModel) {
    const day = Math.floor(model.tick / 1440) + 1;
    const mins = model.tick % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(Math.floor(mins % 60)).padStart(2, "0");
    this.hud.innerHTML = `<b>raw WebGPU campaign</b><span>Day ${day}, ${hh}:${mm}</span><span>${model.treasury} gold</span><span>paused</span>`;
    this.renderArmy(model);
    this.renderCity(model);
    this.renderDiplomacy(model);
    this.renderClasses(model);
  }

  stats() {
    return {
      armyPanel: this.armyPanel.style.display !== "none",
      cityPanel: this.cityPanel.style.display !== "none",
      diplomacyRows: this.diplomacyPanel.querySelectorAll(".cmp-diplo-row").length,
      classRows: this.classesPanel.querySelectorAll(".cmp-class-row").length,
      autoReplenishToggle: this.armyPanel.querySelector("#cmp-auto-replenish") !== null,
      rendererSurfaces: 3,
      domSurfaces: 5,
      postCutoverScreenshots: "renderer-only",
    };
  }

  destroy() {
    this.armyRoot.unmount();
    this.cityRoot.unmount();
    this.diploRoot.unmount();
    this.classesRoot.unmount();
    this.root.remove();
  }

  private renderArmy(model: CampaignUiModel) {
    const roster =
      model.selectedArmy < 0
        ? null
        : (JSON.parse(model.campaign.army_roster_json(model.selectedArmy)) as
            | ArmyRosterRow[]
            | null);
    if (model.selectedArmy < 0 || !roster) {
      this.armyPanel.style.display = "none";
      this.armyRoot.render(null);
      return;
    }
    const me = model.armies.find((army) => army.id === model.selectedArmy);
    const auto = model.campaign.army_auto_replenish(model.selectedArmy);
    this.armyPanel.style.display = "block";
    flushSync(() =>
      this.armyRoot.render(
        createElement(ArmyPanel, {
          armyId: model.selectedArmy,
          roster,
          me,
          buddy: undefined,
          spotIdx: -1,
          autoReplenish: auto,
          onAutoReplenish: (on) => this.onAutoReplenish?.(model.selectedArmy, on),
          onHalt: NOOP,
          onAmbush: NOOP,
          onCamp: NOOP,
          onSplit: NOOP,
          onMerge: NOOP,
        }),
      ),
    );
  }

  private renderCity(model: CampaignUiModel) {
    const city = model.selectedCity < 0 ? undefined : model.cities.get(model.selectedCity);
    const detail = city
      ? (JSON.parse(model.campaign.city_json(model.selectedCity)) as CityDetail | null)
      : null;
    if (!city || !detail) {
      this.cityPanel.style.display = "none";
      this.cityRoot.render(null);
      return;
    }
    const n = model.data.map.nodes[model.selectedCity];
    const mineCity = city.owner === model.campaign.player_faction();
    this.cityPanel.style.display = "block";
    flushSync(() =>
      this.cityRoot.render(
        createElement(CityPanel, {
          name: n.name,
          tier: n.tier,
          factionName: model.data.map.factions[city.owner]?.name ?? "?",
          garrison: city.garrison,
          queue: city.queue,
          mineCity,
          detail,
          recruitClasses: model.recruitClasses,
          onPolicy: NOOP,
          onRecruit: NOOP,
        }),
      ),
    );
  }

  private renderDiplomacy(model: CampaignUiModel) {
    this.diplomacyPanel.style.display = model.diplomacyOpen ? "block" : "none";
    if (!model.diplomacyOpen) {
      this.diploRoot.render(null);
      return;
    }
    const list = JSON.parse(model.campaign.diplomacy_json()) as DiplomacyRow[];
    flushSync(() => this.diploRoot.render(createElement(DiplomacyPanel, { list, onAction: NOOP })));
  }

  private renderClasses(model: CampaignUiModel) {
    this.classesPanel.style.display = model.classBuilderOpen ? "block" : "none";
    if (!model.classBuilderOpen) {
      this.classesRoot.render(null);
      return;
    }
    const rows = JSON.parse(model.campaign.class_doctrine_json()) as ClassDoctrineRow[];
    flushSync(() =>
      this.classesRoot.render(
        createElement(ClassBuilder, {
          rows,
          onSelectUnit: NOOP,
          onSelectSize: NOOP,
          onApply: NOOP,
        }),
      ),
    );
  }
}
