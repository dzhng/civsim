// The temporary per-unit DOM readout: own-unit stat bars and status-effect
// chips. The flag itself is now the in-scene 3D standard; slice 12 moves this
// readout into renderer billboards and retires this component.

import { factionForTeam } from "../../../packages/game-renderer/src/battle/factionColors";

export type ChipKind = "plain" | "hot" | "bad";
export interface BannerChip {
  text: string;
  kind?: ChipKind;
  title?: string;
}
export interface BannerState {
  team: 0 | 1;
  mine: boolean;
  hp: number; // 0..1 of full strength
  cohesion: number; // 0..1
  morale: number; // 0..1
  stamina: number; // 0..1
  chips: BannerChip[];
  selected: boolean;
}

export class UnitBanner {
  readonly el: HTMLDivElement;
  private bars: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private cohFill: HTMLDivElement;
  private moraleFill: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private fx: HTMLDivElement;
  private team = -1;
  private mine = false;
  private chipKey = "";

  constructor() {
    const el = document.createElement("div");
    el.className = "ubanner";

    const bars = document.createElement("div");
    bars.className = "ubanner-bars";
    bars.hidden = true;
    const hp = document.createElement("div");
    hp.className = "ubar";
    this.hpFill = document.createElement("div");
    hp.append(this.hpFill);
    const coh = document.createElement("div");
    coh.className = "ubar coh";
    this.cohFill = document.createElement("div");
    coh.append(this.cohFill);
    const morale = document.createElement("div");
    morale.className = "ubar morale";
    this.moraleFill = document.createElement("div");
    morale.append(this.moraleFill);
    const stamina = document.createElement("div");
    stamina.className = "ubar stamina";
    this.staminaFill = document.createElement("div");
    stamina.append(this.staminaFill);
    bars.append(hp, coh, morale, stamina);

    this.fx = document.createElement("div");
    this.fx.className = "ubanner-fx";

    el.append(this.fx, bars);
    this.bars = bars;
    this.el = el;
  }

  update(s: BannerState) {
    if (s.team !== this.team) {
      this.team = s.team;
      const bannerCss = factionForTeam(s.team).bannerCss;
      this.hpFill.style.background = bannerCss;
    }
    if (s.mine !== this.mine) {
      this.mine = s.mine;
      this.bars.hidden = !s.mine;
    }
    this.hpFill.style.width = `${(Math.max(0, Math.min(1, s.hp)) * 100).toFixed(1)}%`;
    this.cohFill.style.width = `${(Math.max(0, Math.min(1, s.cohesion)) * 100).toFixed(1)}%`;
    this.moraleFill.style.width = `${(Math.max(0, Math.min(1, s.morale)) * 100).toFixed(1)}%`;
    this.staminaFill.style.width = `${(Math.max(0, Math.min(1, s.stamina)) * 100).toFixed(1)}%`;
    // Chips churn far less than the bars; rebuild only when the set changes.
    const key = s.chips.map((c) => (c.kind ?? "") + c.text).join("|");
    if (key !== this.chipKey) {
      this.chipKey = key;
      this.fx.replaceChildren(
        ...s.chips.map((c) => {
          const b = document.createElement("b");
          if (c.kind && c.kind !== "plain") b.className = c.kind;
          if (c.title) b.title = c.title;
          b.textContent = c.text;
          return b;
        }),
      );
    }
  }

  /** Bottom-anchor the DOM readout at the projected 3D pole top. */
  place(x: number, y: number, scale = 1) {
    this.el.style.left = `${x.toFixed(0)}px`;
    this.el.style.top = `${y.toFixed(0)}px`;
    this.el.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(3)})`;
  }

  setVisible(v: boolean) {
    this.el.style.display = v ? "flex" : "none";
  }
}

// --- Visual-regression harness -------------------------------------------------
// Representative states for the DOM remainder: own-unit bars and status chips.
// The in-scene 3D standard is covered by battle renderer scenes.
export const BANNER_GALLERY: { label: string; state: BannerState }[] = [
  {
    label: "fresh / player",
    state: {
      team: 0,
      mine: true,
      hp: 1,
      cohesion: 1,
      morale: 1,
      stamina: 1,
      selected: false,
      chips: [],
    },
  },
  {
    label: "fresh / enemy",
    state: {
      team: 1,
      mine: false,
      hp: 1,
      cohesion: 1,
      morale: 1,
      stamina: 1,
      selected: false,
      chips: [],
    },
  },
  {
    label: "selected",
    state: {
      team: 0,
      mine: true,
      hp: 0.86,
      cohesion: 0.93,
      morale: 0.88,
      stamina: 0.64,
      selected: true,
      chips: [
        { text: "ATK", title: "attacking" },
        { text: "CHG!", kind: "hot", title: "charging" },
      ],
    },
  },
  {
    label: "fighting",
    state: {
      team: 1,
      mine: false,
      hp: 0.62,
      cohesion: 0.58,
      morale: 0.46,
      stamina: 0.32,
      selected: false,
      chips: [{ text: "ATK" }, { text: "CHG!", kind: "hot" }, { text: "⚔7", kind: "hot" }],
    },
  },
  {
    label: "breaking",
    state: {
      team: 0,
      mine: true,
      hp: 0.24,
      cohesion: 0.12,
      morale: 0.08,
      stamina: 0.27,
      selected: false,
      chips: [
        { text: "ROUT", kind: "bad" },
        { text: "TIRED", kind: "bad" },
        { text: "CRUSH", kind: "bad" },
      ],
    },
  },
  {
    label: "ranged / dry",
    state: {
      team: 1,
      mine: false,
      hp: 0.78,
      cohesion: 0.71,
      morale: 0.67,
      stamina: 0.18,
      selected: false,
      chips: [{ text: "KITE" }, { text: "AMMO!", kind: "bad" }, { text: "2nd", kind: "hot" }],
    },
  },
];

/** Mount the gallery into a host element (used by the `?test=banners` route). */
export function mountBannerGallery(root: HTMLElement) {
  root.id = "banner-gallery";
  for (const { label, state } of BANNER_GALLERY) {
    const cell = document.createElement("div");
    cell.className = "ubanner-cell";
    const b = new UnitBanner();
    b.update(state);
    b.el.style.position = "static";
    b.el.style.display = "flex";
    b.el.style.transform = "none";
    const cap = document.createElement("div");
    cap.className = "ubanner-cap";
    cap.textContent = label;
    cell.append(b.el, cap);
    root.append(cell);
  }
}
