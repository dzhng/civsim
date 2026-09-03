import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import { modelLookForClass } from "@packages/game-renderer/src/models/shared/soldierModel";
import { CLASS_NAMES } from "./classData";
import type { UnitCardInit, UnitCardState } from "./unitCard";
import { UnitCardsReact } from "../ui/hud/UnitCardsReact";

export const BATTLE_UI_LAYER_CONTRACT = {
  rendererOwned: [
    "battle terrain",
    "skinned soldiers",
    "selection and destination overlays",
    "minimap compositor",
    "projectiles and battlefield effects",
  ],
  domRetained: [
    "HUD readouts",
    "toolbar controls",
    "unit card strip",
    "pause and game-over modals",
    "manual/help panels",
  ],
  cutoverRule:
    "After WebGPU becomes the default renderer, routine screenshots target the WebGPU game only; legacy renderer captures are retained only as migration evidence.",
} as const;

export interface BattleUiGame {
  unit_count(): number;
  unit_info_ptr(): number;
  unit_info_stride(): number;
}

export interface BattleUiOptions {
  selectedUnits?: number[];
  tick?: number;
  paused?: boolean;
  pursueOn?: boolean;
  fireAtWill?: boolean;
  renderer?: string;
}

export interface BattleUnitCard {
  init: UnitCardInit;
  state: UnitCardState | null;
}

export interface BattleUiModel {
  contract: typeof BATTLE_UI_LAYER_CONTRACT;
  tick: number;
  paused: boolean;
  renderer: string;
  selectedUnits: number[];
  cards: BattleUnitCard[];
  selectedSummary: {
    unit: number;
    name: string;
    alive: number;
    total: number;
    cohesion: number;
    morale: number;
    stamina: number;
    routing: boolean;
    running: boolean;
    atEase: boolean;
  } | null;
  toolbar: { command: string; label: string; active: boolean; disabled: boolean }[];
}

export function buildBattleUiModel(
  game: BattleUiGame,
  memory: WebAssembly.Memory,
  options: BattleUiOptions = {},
): BattleUiModel {
  const stride = game.unit_info_stride();
  const info = new Float32Array(memory.buffer, game.unit_info_ptr(), game.unit_count() * stride);
  const fallbackSelected = firstPlayerUnit(info, game.unit_count(), stride);
  const selectedUnits = options.selectedUnits?.length
    ? options.selectedUnits
    : fallbackSelected >= 0
      ? [fallbackSelected]
      : [];
  const selectedSet = new Set(selectedUnits);
  const cards: BattleUnitCard[] = [];
  let selectedSummary: BattleUiModel["selectedSummary"] = null;

  for (let unit = 0; unit < game.unit_count(); unit++) {
    const o = unit * stride;
    const team = info[o + UNIT_INFO.team] === 1 ? 1 : 0;
    const cls = Math.max(0, Math.floor(info[o + UNIT_INFO.classId] || 0));
    const alive = info[o + UNIT_INFO.alive] || 0;
    const total = info[o + UNIT_INFO.total] || alive;
    const common = {
      alive,
      total,
      cohesion: clamp01(info[o + UNIT_INFO.cohesion] ?? 0),
      morale: clamp01(info[o + UNIT_INFO.morale] ?? 0),
      stamina: clamp01(info[o + UNIT_INFO.stamina] ?? 0),
      routing: info[o + UNIT_INFO.routing] > 0.5,
      selected: selectedSet.has(unit),
    };
    const renderLook = info[o + UNIT_INFO.renderLook];

    if (team === 0) {
      cards.push({
        init: {
          unit,
          cls,
          look: Number.isFinite(renderLook) ? renderLook : modelLookForClass(cls),
          team,
          name: CLASS_NAMES[cls] ?? `Class ${cls}`,
        },
        state: alive > 0 ? common : null,
      });
    }

    if (selectedSet.has(unit) && !selectedSummary) {
      selectedSummary = {
        unit,
        name: CLASS_NAMES[cls] ?? `Class ${cls}`,
        ...common,
        running: info[o + UNIT_INFO.running] > 0.5,
        atEase: info[o + UNIT_INFO.atEase] > 0.5,
      };
    }
  }

  return {
    contract: BATTLE_UI_LAYER_CONTRACT,
    tick: options.tick ?? 0,
    paused: options.paused ?? true,
    renderer: options.renderer ?? "raw WebGPU",
    selectedUnits,
    cards,
    selectedSummary,
    toolbar: [
      {
        command: "pace",
        label: "Run",
        active: Boolean(selectedSummary?.running),
        disabled: !selectedSummary,
      },
      {
        command: "reform",
        label: "Reform",
        active: Boolean(selectedSummary?.atEase),
        disabled: !selectedSummary,
      },
      {
        command: "pursue",
        label: "Pursue",
        active: Boolean(options.pursueOn),
        disabled: !selectedSummary,
      },
      {
        command: "fire",
        label: "Fire",
        active: options.fireAtWill ?? true,
        disabled: !selectedSummary,
      },
      {
        command: "pause",
        label: options.paused ? "Play" : "Pause",
        active: options.paused ?? true,
        disabled: false,
      },
    ],
  };
}

export class BattleUiLayer {
  readonly el: HTMLDivElement;
  private hud: HTMLDivElement;
  private summary: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private cardsRoot: HTMLDivElement;
  private cards: UnitCardsReact;
  private cardKey = "";
  private latest: BattleUiModel | null = null;

  constructor(
    private root: HTMLElement,
    private onSelect: (unit: number, additive: boolean) => void = () => {},
  ) {
    this.el = document.createElement("div");
    this.el.className = "renderer-battle-ui";
    this.hud = document.createElement("div");
    this.hud.className = "renderer-battle-hud";
    this.summary = document.createElement("div");
    this.summary.className = "renderer-battle-summary";
    this.cardsRoot = document.createElement("div");
    this.cardsRoot.className = "renderer-unitcards";
    this.toolbar = document.createElement("div");
    this.toolbar.className = "renderer-toolbar";
    this.el.append(this.hud, this.summary, this.cardsRoot, this.toolbar);
    this.root.appendChild(this.el);
    this.cards = new UnitCardsReact(this.cardsRoot, (unit, additive) =>
      this.onSelect(unit, additive),
    );
  }

  render(model: BattleUiModel) {
    this.latest = model;
    const nextKey = model.cards
      .map((card) => `${card.init.unit}:${card.init.cls}:${card.init.look ?? -1}:${card.init.team}`)
      .join("|");
    if (nextKey !== this.cardKey) {
      this.cardKey = nextKey;
      this.cards.build(model.cards.map((card) => card.init));
    }
    this.cards.update(model.cards.map((card) => card.state));
    this.hud.innerHTML = [
      `<b>${escapeHtml(model.renderer)}</b>`,
      `<span>tick ${model.tick}</span>`,
      `<span>${model.paused ? "paused" : "live"}</span>`,
      `<span>${model.cards.length} units</span>`,
    ].join("");
    this.summary.innerHTML = model.selectedSummary
      ? selectedSummaryHtml(model.selectedSummary)
      : "<b>No unit</b><span>-</span>";
    this.toolbar.replaceChildren(
      ...model.toolbar.map((button) => {
        const el = document.createElement("button");
        el.type = "button";
        el.dataset.cmd = button.command;
        el.textContent = button.label;
        el.className = button.active ? "on" : "";
        el.disabled = button.disabled;
        return el;
      }),
    );
  }

  stats() {
    return {
      cards: this.latest?.cards.length ?? 0,
      visibleCards: this.latest?.cards.filter((card) => card.state).length ?? 0,
      toolbarButtons: this.latest?.toolbar.length ?? 0,
      selectedUnit: this.latest?.selectedSummary?.unit ?? -1,
      rendererSurfaces: BATTLE_UI_LAYER_CONTRACT.rendererOwned.length,
      domSurfaces: BATTLE_UI_LAYER_CONTRACT.domRetained.length,
      postCutoverScreenshots: "renderer-only",
    };
  }

  destroy() {
    this.cards.destroy();
    this.el.remove();
  }
}

function firstPlayerUnit(info: Float32Array, count: number, stride: number) {
  for (let unit = 0; unit < count; unit++) {
    const o = unit * stride;
    if (info[o + UNIT_INFO.team] === 0 && info[o + UNIT_INFO.alive] > 0) return unit;
  }
  return -1;
}

function selectedSummaryHtml(summary: NonNullable<BattleUiModel["selectedSummary"]>) {
  const hp = summary.total > 0 ? summary.alive / summary.total : 0;
  return [
    `<b>${escapeHtml(summary.name)}</b>`,
    `<span>${summary.alive}/${summary.total}</span>`,
    meter("hp", hp),
    meter("coh", summary.cohesion),
    meter("mor", summary.morale),
    `<span>${summary.routing ? "routing" : summary.running ? "running" : summary.atEase ? "reforming" : "formed"}</span>`,
  ].join("");
}

function meter(kind: string, value: number) {
  return `<i class="${kind}"><em style="width:${(clamp01(value) * 100).toFixed(0)}%"></em></i>`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
