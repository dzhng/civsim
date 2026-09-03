import type { Campaign } from "../wasm/game_wasm.js";
import type { CampaignData } from "./data";
import type { ArmyRosterRow, CityDetail, ClassDoctrineRow, DiplomacyRow } from "./panels";
import { campaignDomHtml } from "./panels";
import type { ArmyView, CityView } from "@packages/game-renderer/src/campaign/entityFrame";
import { mountCampaignHud, type CampaignHudHandle } from "../ui/campaign/CampaignHud";

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
  private campaignHud: CampaignHudHandle;

  constructor(
    host: HTMLElement,
    private onAutoReplenish?: (army: number, on: boolean) => void,
  ) {
    host.querySelector(".renderer-campaign-ui")?.remove();
    this.root = document.createElement("div");
    this.root.className = "renderer-campaign-ui";
    this.root.innerHTML = campaignDomHtml();
    host.appendChild(this.root);
    this.campaignHud = mountCampaignHud(this.root.querySelector("#cmp-hud-root")!);
    this.armyPanel = this.root.querySelector("#cmp-army") as HTMLDivElement;
    this.cityPanel = this.root.querySelector("#cmp-city") as HTMLDivElement;
    this.diplomacyPanel = this.root.querySelector("#cmp-diplomacy") as HTMLDivElement;
    this.classesPanel = this.root.querySelector("#cmp-classes") as HTMLDivElement;
  }

  render(model: CampaignUiModel) {
    const day = Math.floor(model.tick / 1440) + 1;
    const mins = model.tick % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(Math.floor(mins % 60)).padStart(2, "0");
    this.campaignHud.setTopBar({
      dateText: `Day ${day}, ${hh}:${mm}  PAUSED`,
      goldText: `${model.treasury.toLocaleString()} gold`,
      paused: true,
      speed: 0,
      factionView: false,
      fog: false,
      diploOpen: model.diplomacyOpen,
      classesOpen: model.classBuilderOpen,
      onPause: NOOP,
      onSpeed: NOOP,
      onFactions: NOOP,
      onFog: NOOP,
      onDiplomacy: NOOP,
      onClasses: NOOP,
      onSave: NOOP,
      onExit: NOOP,
    });
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
    this.campaignHud.destroy();
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
      this.campaignHud.setArmy(null);
      return;
    }
    const me = model.armies.find((army) => army.id === model.selectedArmy);
    const auto = model.campaign.army_auto_replenish(model.selectedArmy);
    this.campaignHud.setArmy({
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
    });
  }

  private renderCity(model: CampaignUiModel) {
    const city = model.selectedCity < 0 ? undefined : model.cities.get(model.selectedCity);
    const detail = city
      ? (JSON.parse(model.campaign.city_json(model.selectedCity)) as CityDetail | null)
      : null;
    if (!city || !detail) {
      this.campaignHud.setCity(null);
      return;
    }
    const n = model.data.map.nodes[model.selectedCity];
    const mineCity = city.owner === model.campaign.player_faction();
    this.campaignHud.setCity({
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
    });
  }

  private renderDiplomacy(model: CampaignUiModel) {
    if (!model.diplomacyOpen) {
      this.campaignHud.setDiplomacy(null);
      return;
    }
    const list = JSON.parse(model.campaign.diplomacy_json()) as DiplomacyRow[];
    this.campaignHud.setDiplomacy({ list, onAction: NOOP });
  }

  private renderClasses(model: CampaignUiModel) {
    if (!model.classBuilderOpen) {
      this.campaignHud.setClasses(null);
      return;
    }
    const rows = JSON.parse(model.campaign.class_doctrine_json()) as ClassDoctrineRow[];
    this.campaignHud.setClasses({
      rows,
      onSelectUnit: NOOP,
      onSelectSize: NOOP,
      onApply: NOOP,
    });
  }
}
