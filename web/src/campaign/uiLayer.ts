import type { Campaign } from '../wasm/game_wasm.js';
import type { CampaignData } from './data';
import {
  armyPanelHtml,
  classBuilderHtml,
  cityPanelHtml,
  diplomacyHtml,
  type ArmyRosterRow,
  type CityDetail,
  type ClassDoctrineRow,
  type DiplomacyRow,
} from './panels';
import type { ArmyView, CityView } from './views';

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

export class CampaignUiLayer {
  private root: HTMLDivElement;
  private armyPanel: HTMLDivElement;
  private cityPanel: HTMLDivElement;
  private diplomacyPanel: HTMLDivElement;
  private classesPanel: HTMLDivElement;
  private hud: HTMLDivElement;

  constructor(host: HTMLElement, private onAutoReplenish?: (army: number, on: boolean) => void) {
    host.querySelector('.renderer-campaign-ui')?.remove();
    this.root = document.createElement('div');
    this.root.className = 'renderer-campaign-ui';
    this.root.innerHTML = `
      <div class="renderer-campaign-hud"></div>
      <div class="renderer-campaign-panel army"></div>
      <div class="renderer-campaign-panel city"></div>
      <div class="renderer-campaign-panel diplomacy"></div>
      <div class="renderer-campaign-panel classes"></div>`;
    host.appendChild(this.root);
    this.hud = this.root.querySelector('.renderer-campaign-hud') as HTMLDivElement;
    this.armyPanel = this.root.querySelector('.renderer-campaign-panel.army') as HTMLDivElement;
    this.cityPanel = this.root.querySelector('.renderer-campaign-panel.city') as HTMLDivElement;
    this.diplomacyPanel = this.root.querySelector('.renderer-campaign-panel.diplomacy') as HTMLDivElement;
    this.classesPanel = this.root.querySelector('.renderer-campaign-panel.classes') as HTMLDivElement;
  }

  render(model: CampaignUiModel) {
    const day = Math.floor(model.tick / 1440) + 1;
    const mins = model.tick % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(Math.floor(mins % 60)).padStart(2, '0');
    this.hud.innerHTML = `<b>raw WebGPU campaign</b><span>Day ${day}, ${hh}:${mm}</span><span>${model.treasury} gold</span><span>paused</span>`;
    this.renderArmy(model);
    this.renderCity(model);
    this.renderDiplomacy(model);
    this.renderClasses(model);
  }

  stats() {
    return {
      armyPanel: this.armyPanel.style.display !== 'none',
      cityPanel: this.cityPanel.style.display !== 'none',
      diplomacyRows: this.diplomacyPanel.querySelectorAll('.cmp-diplo-row').length,
      classRows: this.classesPanel.querySelectorAll('.cmp-class-row').length,
      autoReplenishToggle: this.armyPanel.querySelector('#cmp-auto-replenish') !== null,
      rendererSurfaces: 3,
      domSurfaces: 5,
      postCutoverScreenshots: 'renderer-only',
    };
  }

  destroy() {
    this.root.remove();
  }

  private renderArmy(model: CampaignUiModel) {
    if (model.selectedArmy < 0) {
      this.armyPanel.style.display = 'none';
      return;
    }
    const roster = JSON.parse(model.campaign.army_roster_json(model.selectedArmy)) as ArmyRosterRow[] | null;
    if (!roster) {
      this.armyPanel.style.display = 'none';
      return;
    }
    const me = model.armies.find((army) => army.id === model.selectedArmy);
    const auto = model.campaign.army_auto_replenish(model.selectedArmy);
    this.armyPanel.innerHTML = armyPanelHtml(model.selectedArmy, roster, me, undefined, -1, auto);
    this.armyPanel.style.display = 'block';
    this.armyPanel.querySelector('#cmp-auto-replenish')?.addEventListener('change', (event) => {
      const on = (event.currentTarget as HTMLInputElement).checked;
      this.onAutoReplenish?.(model.selectedArmy, on);
    });
  }

  private renderCity(model: CampaignUiModel) {
    if (model.selectedCity < 0) {
      this.cityPanel.style.display = 'none';
      return;
    }
    const city = model.cities.get(model.selectedCity);
    if (!city) {
      this.cityPanel.style.display = 'none';
      return;
    }
    const detail = JSON.parse(model.campaign.city_json(model.selectedCity)) as CityDetail | null;
    if (!detail) {
      this.cityPanel.style.display = 'none';
      return;
    }
    const mineCity = city.owner === model.campaign.player_faction();
    this.cityPanel.innerHTML = cityPanelHtml(model.data, model.selectedCity, city, mineCity, detail, model.recruitClasses);
    this.cityPanel.style.display = 'block';
  }

  private renderDiplomacy(model: CampaignUiModel) {
    this.diplomacyPanel.style.display = model.diplomacyOpen ? 'block' : 'none';
    if (!model.diplomacyOpen) return;
    const list = JSON.parse(model.campaign.diplomacy_json()) as DiplomacyRow[];
    this.diplomacyPanel.innerHTML = diplomacyHtml(list);
  }

  private renderClasses(model: CampaignUiModel) {
    this.classesPanel.style.display = model.classBuilderOpen ? 'block' : 'none';
    if (!model.classBuilderOpen) return;
    const rows = JSON.parse(model.campaign.class_doctrine_json()) as ClassDoctrineRow[];
    this.classesPanel.innerHTML = classBuilderHtml(rows);
  }
}
