// Shared model + math for the Total-War unit-card strip: the card grid pass, the
// per-frame key-skip + bar writes, and the flat side-view portrait. Consumed by
// the React card bar (web/src/ui/hud/UnitCardsReact.tsx); the vanilla DOM
// UnitCards class was removed once the spike shipped React as the default.

import {
  lookForModel,
  modelLookForClass,
} from "@packages/game-renderer/src/models/shared/soldierModel";
import {
  factionForTeam,
  factionPrimaryCss,
} from "@packages/game-renderer/src/battle/factionColors";
import { computeCardGrid, type CardGridOpts } from "./cardGrid";

// Faction accents keep cards, banners, and WebGPU soldier colours reading as
// the same side.
export const FACTION_CSS = [
  factionPrimaryCss(factionForTeam(0)),
  factionPrimaryCss(factionForTeam(1)),
];

// Total-War card-bar constants (the production source of truth — cardGrid.ts
// only holds matching fallbacks). Cards are a FIXED size; the bar wraps into
// more rows as the roster grows (David, 2026-06-30). Tunable at the S2 checkpoint.
const CARD_W = 58; // fixed card width in px (cardH derives from the 3:4 aspect); 20% smaller (David, 2026-07-01)
// The centered bar must clear the bottom-right minimap (a GPU overlay the DOM
// can't measure): minimapPass sizes it ≤188px wide with a 16px margin, so a
// centered bar collides once it is wider than viewport − 2×~204. Reserve that
// zone (symmetric, to stay centered). The lab harness has no minimap and passes
// a bare margin instead. Tunable at the S2 checkpoint.
export const MINIMAP_RESERVE = 210;
// Production HUD left reserve: the card bar must clear the bottom-left info card
// (#hud), whose right edge is 12(inset) + 282(max content) + 26(padding) +
// 6(border) = 326px, plus a small gap. This is ASYMMETRIC from the right (which
// only clears the minimap, MINIMAP_RESERVE): reserving the full 336 on BOTH sides
// would narrow the bar enough to wrap an extra row, growing it tall enough to
// cover mid-field units and break click-selection. Keeping the right wide keeps
// the bar short. The renderer-lab passes MINIMAP_RESERVE on both sides.
export const BOTTOM_CARD_LEFT_RESERVE = 336;
// Production HUD right reserve: clears the bottom-right minimap card, now flush in
// the corner (12px inset + 240px canvas + 8px frame + gap ≈ 268), so the centered
// card bar doesn't slide under it. Asymmetric with the left. The renderer-lab has
// no minimap and passes MINIMAP_RESERVE on both sides.
export const BOTTOM_CARD_RIGHT_RESERVE = 268;
const GRID_OPTS: CardGridOpts = { cardW: CARD_W, aspect: 3 / 4, gap: 4, maxRows: 3 };

/** The four live nodes a card's per-frame update writes into. */
export interface CardBarRefs {
  hp: HTMLElement;
  coh: HTMLElement;
  mor: HTMLElement;
  count: HTMLElement;
}

/** Quantized change key — the hand-diffed skip that keeps the 60Hz card update
 * cheap: only repaint a card when a visible band actually crosses a step. The
 * one source of this logic, shared by the vanilla and React card bars (the S3
 * spike), so the two render strategies are measured on identical work. */
export function cardStateKey(s: UnitCardState): string {
  const hpFrac = s.total > 0 ? s.alive / s.total : 0;
  return `${(hpFrac * 50) | 0}|${(s.cohesion * 30) | 0}|${(s.morale * 30) | 0}|${(s.stamina * 20) | 0}|${s.selected ? 1 : 0}|${s.routing ? 1 : 0}`;
}

/** Write one card's bars + selected/rout state to its live nodes. The single
 * source of the per-frame card paint (shared by both card bars). */
export function applyCardVisual(card: HTMLElement, b: CardBarRefs, s: UnitCardState): void {
  const hpFrac = s.total > 0 ? s.alive / s.total : 0;
  b.hp.style.width = (hpFrac * 100).toFixed(0) + "%";
  b.hp.style.background = hpFrac > 0.5 ? "#5cba46" : hpFrac > 0.25 ? "#d6b13a" : "#cf4a3a";
  b.coh.style.width = (s.cohesion * 100).toFixed(0) + "%";
  b.mor.style.width = (s.morale * 100).toFixed(0) + "%";
  b.count.textContent = String(s.alive);
  card.classList.toggle("sel", s.selected);
  card.classList.toggle("rout", s.routing);
}

/** No-scroll grid pass: pick rows/cols at the fixed card size for the width
 * budget and hand them to CSS as custom properties on `root`. Layout, never
 * per-frame. Shared by both card bars.
 *
 * The budget is the viewport minus a left and right reserve (asymmetric: the
 * bottom-left info card is wider than the right-hand minimap). The bar centers in
 * that window via `--card-center-x` (px), which #unitcards reads for its `left`.
 * The lab passes equal reserves, so the center collapses to the viewport midpoint
 * — pixel-identical to the old `left: 50%`. */
export function applyCardGrid(
  root: HTMLElement,
  count: number,
  leftReserve: number,
  rightReserve: number,
): void {
  const boxW = window.innerWidth - leftReserve - rightReserve;
  const g = computeCardGrid(count, boxW, GRID_OPTS);
  root.style.setProperty("--cols", String(g.cols));
  root.style.setProperty("--card-w", g.cardW + "px");
  root.style.setProperty("--card-h", g.cardH + "px");
  root.style.setProperty("--card-center-x", (leftReserve + boxW / 2).toFixed(1) + "px");
  root.classList.toggle("undersized", g.degenerate);
  (window as unknown as { __cardGrid?: unknown }).__cardGrid = {
    rows: g.rows,
    cols: g.cols,
    cardW: g.cardW,
    degenerate: g.degenerate,
  };
}

export interface UnitCardInit {
  unit: number; // sim unit id (for selection)
  cls: number;
  look?: number;
  team: 0 | 1;
  name: string;
}

export interface UnitCardState {
  alive: number;
  total: number;
  cohesion: number; // 0..1
  morale: number; // 0..1
  stamina: number; // 0..1
  routing: boolean;
  selected: boolean;
}

const W = 38,
  H = 48; // portrait canvas size (CSS px; drawn at 2x for crispness)

// A compact side-view soldier (or rider) for class `cls`, facing right.
// Portraits keep a small UI faction sash; the 3D crowd uses flags plus armbands.
export function drawPortrait(
  canvas: HTMLCanvasElement,
  cls: number,
  look: number | undefined,
  team: 0 | 1,
) {
  const L = lookForModel(look ?? modelLookForClass(cls));
  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const g = canvas.getContext("2d")!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, W, H);
  const fac = FACTION_CSS[team];
  const SKIN = "#c8966f",
    BRONZE = "#b08a3e",
    LINEN = "#cabf9c",
    LEATHER = "#5f4426",
    IRON = "#9aa0a8",
    WOOD = "#7a5a32";
  const cx = W / 2;
  const groundY = H - 6;

  if (L.mounted) {
    // Horse in profile, rider above.
    g.fillStyle = "#5b4127";
    g.beginPath();
    g.ellipse(cx, groundY - 12, 20, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 16, groundY - 10, 4, 12);
    g.fillRect(cx + 10, groundY - 10, 4, 12); // legs
    g.fillRect(cx + 16, groundY - 22, 5, 12); // neck
    g.fillStyle = "#3a2a18";
    g.fillRect(cx + 18, groundY - 26, 7, 6); // head
    // Rider
    g.fillStyle = LINEN;
    g.fillRect(cx - 3, groundY - 30, 8, 12);
    g.fillStyle = fac;
    g.fillRect(cx - 3, groundY - 30, 8, 3); // sash
    g.fillStyle = SKIN;
    g.fillRect(cx - 1, groundY - 38, 6, 7);
    g.fillStyle = BRONZE;
    g.fillRect(cx - 2, groundY - 40, 8, 4); // helmet
    g.strokeStyle = WOOD;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx + 6, groundY - 34);
    g.lineTo(cx + 24, groundY - 24);
    g.stroke(); // lance
    return;
  }

  // Legs
  g.fillStyle = LINEN;
  g.fillRect(cx - 6, groundY - 22, 5, 16);
  g.fillRect(cx + 1, groundY - 22, 5, 16);
  g.fillStyle = LEATHER;
  g.fillRect(cx - 6, groundY - 8, 5, 6);
  g.fillRect(cx + 1, groundY - 8, 5, 6); // boots
  // Torso (cuirass) + faction sash
  g.fillStyle = BRONZE;
  g.fillRect(cx - 7, groundY - 38, 14, 18);
  g.fillStyle = fac;
  g.fillRect(cx - 7, groundY - 34, 14, 3);
  // Head + helmet
  g.fillStyle = SKIN;
  g.fillRect(cx - 4, groundY - 48, 8, 9);
  g.fillStyle = BRONZE;
  g.fillRect(cx - 5, groundY - 50, 10, 5);
  if (L.crest) {
    g.fillStyle = fac;
    g.fillRect(cx - 1, groundY - 57, 3, 8);
    g.fillRect(cx - 4, groundY - 55, 8, 3);
  }
  // Weapon (right side)
  g.strokeStyle = WOOD;
  g.lineWidth = 2;
  g.beginPath();
  const wx = cx + 9;
  if (L.weapon === "pike") {
    g.moveTo(wx, groundY - 2);
    g.lineTo(wx, groundY - 56);
  } else if (L.weapon === "spear" || L.weapon === "javelin") {
    g.moveTo(wx, groundY - 4);
    g.lineTo(wx, groundY - 48);
  } else if (L.weapon === "bow") {
    g.strokeStyle = WOOD;
    g.arc(wx + 2, groundY - 30, 12, -1.1, 1.1);
  } else if (L.weapon === "greatsword") {
    g.strokeStyle = IRON;
    g.moveTo(wx, groundY - 6);
    g.lineTo(wx, groundY - 50);
  } else if (L.weapon !== "none") {
    g.strokeStyle = IRON;
    g.moveTo(wx, groundY - 20);
    g.lineTo(wx + 3, groundY - 40);
  }
  g.stroke();
  // Shield (left side, faction-accented)
  if (L.shield !== "none") {
    const sh = { tall: 22, round: 16, small: 12 }[L.shield];
    g.fillStyle = WOOD;
    g.fillRect(cx - 12, groundY - 30, 6, sh);
    g.fillStyle = fac;
    g.fillRect(cx - 11, groundY - 30 + sh / 2 - 2, 4, 4);
  }
}
