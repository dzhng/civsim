// A unit's banner: one self-contained UI component carrying the standard (a
// team-coloured cloth on a pole) and the unit's live state — health, cohesion,
// and status-effect chips. It owns its DOM and renders from a plain state
// object, so it can be mounted and snapshotted standalone (see
// mountBannerGallery) for visual-regression tests — no sim, no 3D engine.

import { factionForTeam } from "../../../packages/game-renderer/src/battle/factionColors";

export type ChipKind = "plain" | "hot" | "bad";
export interface BannerChip {
  text: string;
  kind?: ChipKind;
  title?: string;
}
export interface BannerState {
  team: 0 | 1;
  hp: number; // 0..1 of full strength
  cohesion: number; // 0..1
  chips: BannerChip[];
  selected: boolean;
}

const SVGNS = "http://www.w3.org/2000/svg";

export class UnitBanner {
  readonly el: HTMLDivElement;
  private cloth: SVGPathElement;
  private hpFill: HTMLDivElement;
  private cohFill: HTMLDivElement;
  private fx: HTMLDivElement;
  private team = -1;
  private selected = false;
  private chipKey = "";

  constructor() {
    const el = document.createElement("div");
    el.className = "ubanner";

    // The standard: a pole topped by a finial, with a swallowtail cloth flying
    // to one side. Only the cloth's fill changes with team.
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "ubanner-flag");
    svg.setAttribute("viewBox", "0 0 56 24");
    const cloth = document.createElementNS(SVGNS, "path");
    cloth.setAttribute("d", "M29 3 L52 5 L46 11 L52 17 L29 15 Z");
    cloth.setAttribute("stroke", "rgba(0,0,0,0.35)");
    cloth.setAttribute("stroke-width", "0.8");
    const pole = document.createElementNS(SVGNS, "rect");
    pole.setAttribute("x", "27");
    pole.setAttribute("y", "1");
    pole.setAttribute("width", "2");
    pole.setAttribute("height", "22");
    pole.setAttribute("rx", "1");
    pole.setAttribute("fill", "#6b5a3e");
    const finial = document.createElementNS(SVGNS, "circle");
    finial.setAttribute("cx", "28");
    finial.setAttribute("cy", "2");
    finial.setAttribute("r", "2.2");
    finial.setAttribute("fill", "#cdb56a");
    svg.append(cloth, pole, finial);

    // The unit's state hangs below the standard like its banner: a health bar,
    // a cohesion bar, then status chips.
    const bars = document.createElement("div");
    bars.className = "ubanner-bars";
    const hp = document.createElement("div");
    hp.className = "ubar";
    this.hpFill = document.createElement("div");
    hp.append(this.hpFill);
    const coh = document.createElement("div");
    coh.className = "ubar coh";
    this.cohFill = document.createElement("div");
    coh.append(this.cohFill);
    bars.append(hp, coh);

    this.fx = document.createElement("div");
    this.fx.className = "ubanner-fx";

    // Stats on top, the standard at the bottom: the pole's foot anchors to the
    // unit (see place), so the standard plants in the ranks and the readout
    // rides above it as one piece.
    el.append(this.fx, bars, svg);
    this.cloth = cloth;
    this.el = el;
  }

  update(s: BannerState) {
    if (s.team !== this.team) {
      this.team = s.team;
      const bannerCss = factionForTeam(s.team).bannerCss;
      this.cloth.setAttribute("fill", bannerCss);
      this.hpFill.style.background = bannerCss;
    }
    this.hpFill.style.width = `${(Math.max(0, Math.min(1, s.hp)) * 100).toFixed(1)}%`;
    this.cohFill.style.width = `${(Math.max(0, Math.min(1, s.cohesion)) * 100).toFixed(1)}%`;
    if (s.selected !== this.selected) {
      this.selected = s.selected;
      this.el.classList.toggle("sel", s.selected);
    }
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

  /** Plant the standard so its pole foot sits at (x, y) screen pixels: the
   *  element is bottom-anchored (−100% of its own height) and centred (−50%),
   *  so the flag rises from the unit and the stats stack above it, whatever the
   *  chip count. */
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
// Representative states; the gallery renders one banner per state so a snapshot
// covers the component's whole surface (both teams, every bar level, the chip
// kinds, selection) without the sim or the engine.
export const BANNER_GALLERY: { label: string; state: BannerState }[] = [
  { label: "fresh / player", state: { team: 0, hp: 1, cohesion: 1, selected: false, chips: [] } },
  { label: "fresh / enemy", state: { team: 1, hp: 1, cohesion: 1, selected: false, chips: [] } },
  {
    label: "selected",
    state: {
      team: 0,
      hp: 0.86,
      cohesion: 0.93,
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
      hp: 0.62,
      cohesion: 0.58,
      selected: false,
      chips: [{ text: "ATK" }, { text: "CHG!", kind: "hot" }, { text: "⚔7", kind: "hot" }],
    },
  },
  {
    label: "breaking",
    state: {
      team: 0,
      hp: 0.24,
      cohesion: 0.12,
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
      hp: 0.78,
      cohesion: 0.71,
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
