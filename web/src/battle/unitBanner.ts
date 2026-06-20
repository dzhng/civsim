// A unit's banner: one self-contained UI component carrying the standard (a
// team-coloured cloth on a pole) and the unit's live state — health, cohesion,
// and status-effect chips. It owns its DOM and renders from a plain state
// object, so it can be mounted and snapshotted standalone (see
// mountBannerGallery) for visual-regression tests — no sim, no 3D engine.

export type ChipKind = 'plain' | 'hot' | 'bad';
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

// Team cloth + health-bar hue (player blue, enemy red), matching the army colours.
const TEAM_HUE = ['#6f9ae8', '#e0604f'];
const SVGNS = 'http://www.w3.org/2000/svg';

// --- Canvas2D banner (the in-game 3D billboard) --------------------------------
// The exact same standard + bars + chips as the DOM component above, drawn to a
// canvas so it can be uploaded as a texture and billboarded in the Babylon
// scene. The DOM version (UnitBanner) stays for the standalone gallery; this is
// its pixel twin for the world. Layout is authored in a fixed 56-wide "design
// box" (matching the CSS) and scaled up by `s` for texture DPI.

/** Natural design size of the banner art, before DPI scaling (CSS units). */
export const BANNER_DESIGN_W = 56;
export const BANNER_DESIGN_H = 56; // flag + bars + up to two chip rows

const CHIP_HOT = '#ffc46b';
const CHIP_BAD = '#ff7a6b';
const CHIP_PLAIN = '#e8e4d8';

/** Draw the banner into `ctx` at scale `s`, bottom-anchored so the pole foot
 *  sits at (BANNER_DESIGN_W/2 * s, BANNER_DESIGN_H * s) — i.e. the standard
 *  plants at the bottom-centre and the readout stacks above it, mirroring the
 *  DOM component's bottom/centre anchoring. Returns nothing; caller clears. */
export function drawBannerCanvas(ctx: CanvasRenderingContext2D, s: BannerState, k: number) {
  const W = BANNER_DESIGN_W;
  const hue = TEAM_HUE[s.team];
  ctx.save();
  ctx.scale(k, k);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Chips: bottom-up bookkeeping needs their height first. One row of small
  // pills, wrapping to a second row, centred — like the flex-wrap CSS.
  ctx.font = '600 7px ui-monospace, Menlo, monospace';
  const pills = s.chips.map((c) => {
    const w = ctx.measureText(c.text).width + 4; // 2px padding each side
    return { text: c.text, w, color: c.kind === 'hot' ? CHIP_HOT : c.kind === 'bad' ? CHIP_BAD : CHIP_PLAIN };
  });
  // Wrap into rows no wider than W.
  const rows: { text: string; w: number; color: string }[][] = [];
  let row: typeof pills = [];
  let rowW = 0;
  for (const p of pills) {
    if (row.length && rowW + p.w + 1 > W) { rows.push(row); row = []; rowW = 0; }
    row.push(p); rowW += p.w + 1;
  }
  if (row.length) rows.push(row);
  const CHIP_H = 9; // pill height incl. gap
  const chipsH = rows.length * CHIP_H;

  // Layout from the top: chips, then bars, then the flag at the bottom so the
  // pole foot lands at (W/2, BANNER_DESIGN_H). Heights mirror the CSS.
  const FLAG_H = 24, BARS_H = 9; // two 3px bars + gaps + margins
  let y = BANNER_DESIGN_H - FLAG_H - BARS_H - chipsH;

  // Status chips.
  for (const r of rows) {
    const totW = r.reduce((a, p) => a + p.w, 0) + (r.length - 1);
    let x = (W - totW) / 2;
    for (const p of r) {
      ctx.fillStyle = 'rgba(14,16,20,0.72)';
      roundRect(ctx, x, y, p.w, 7.5, 2);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x + p.w / 2, y + 4.2);
      x += p.w + 1;
    }
    y += CHIP_H;
  }

  // Bars: HP (team hue), then cohesion (gold). Width 52, centred (2px inset).
  const barW = 52, barX = (W - barW) / 2;
  const bar = (frac: number, fill: string) => {
    ctx.fillStyle = 'rgba(10,10,12,0.55)';
    roundRect(ctx, barX, y, barW, 3, 1.5);
    ctx.fill();
    const w = barW * Math.max(0, Math.min(1, frac));
    if (w > 0.5) {
      ctx.fillStyle = fill;
      roundRect(ctx, barX, y, w, 3, 1.5);
      ctx.fill();
    }
    y += 4;
  };
  bar(s.hp, hue);
  bar(s.cohesion, '#d9c75a');
  y += 1;

  // The standard: pole, finial, swallowtail cloth — the SVG path redrawn. The
  // SVG viewBox was 0..56 x 0..24; place it at the bottom.
  ctx.save();
  ctx.translate(0, y);
  const sel = s.selected;
  if (sel) { ctx.translate(28, 1); ctx.scale(1.12, 1.12); ctx.translate(-28, -1); }
  // pole
  ctx.fillStyle = '#6b5a3e';
  roundRect(ctx, 27, 1, 2, 22, 1);
  ctx.fill();
  // finial
  ctx.fillStyle = '#cdb56a';
  ctx.beginPath();
  ctx.arc(28, 2, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // cloth (swallowtail)
  ctx.beginPath();
  ctx.moveTo(29, 3); ctx.lineTo(52, 5); ctx.lineTo(46, 11); ctx.lineTo(52, 17); ctx.lineTo(29, 15); ctx.closePath();
  ctx.fillStyle = hue;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export class UnitBanner {
  readonly el: HTMLDivElement;
  private cloth: SVGPathElement;
  private hpFill: HTMLDivElement;
  private cohFill: HTMLDivElement;
  private fx: HTMLDivElement;
  private team = -1;
  private selected = false;
  private chipKey = '';

  constructor() {
    const el = document.createElement('div');
    el.className = 'ubanner';

    // The standard: a pole topped by a finial, with a swallowtail cloth flying
    // to one side. Only the cloth's fill changes with team.
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'ubanner-flag');
    svg.setAttribute('viewBox', '0 0 56 24');
    const cloth = document.createElementNS(SVGNS, 'path');
    cloth.setAttribute('d', 'M29 3 L52 5 L46 11 L52 17 L29 15 Z');
    cloth.setAttribute('stroke', 'rgba(0,0,0,0.35)');
    cloth.setAttribute('stroke-width', '0.8');
    const pole = document.createElementNS(SVGNS, 'rect');
    pole.setAttribute('x', '27');
    pole.setAttribute('y', '1');
    pole.setAttribute('width', '2');
    pole.setAttribute('height', '22');
    pole.setAttribute('rx', '1');
    pole.setAttribute('fill', '#6b5a3e');
    const finial = document.createElementNS(SVGNS, 'circle');
    finial.setAttribute('cx', '28');
    finial.setAttribute('cy', '2');
    finial.setAttribute('r', '2.2');
    finial.setAttribute('fill', '#cdb56a');
    svg.append(cloth, pole, finial);

    // The unit's state hangs below the standard like its banner: a health bar,
    // a cohesion bar, then status chips.
    const bars = document.createElement('div');
    bars.className = 'ubanner-bars';
    const hp = document.createElement('div');
    hp.className = 'ubar';
    this.hpFill = document.createElement('div');
    hp.append(this.hpFill);
    const coh = document.createElement('div');
    coh.className = 'ubar coh';
    this.cohFill = document.createElement('div');
    coh.append(this.cohFill);
    bars.append(hp, coh);

    this.fx = document.createElement('div');
    this.fx.className = 'ubanner-fx';

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
      this.cloth.setAttribute('fill', TEAM_HUE[s.team]);
      this.hpFill.style.background = TEAM_HUE[s.team];
    }
    this.hpFill.style.width = `${(Math.max(0, Math.min(1, s.hp)) * 100).toFixed(1)}%`;
    this.cohFill.style.width = `${(Math.max(0, Math.min(1, s.cohesion)) * 100).toFixed(1)}%`;
    if (s.selected !== this.selected) {
      this.selected = s.selected;
      this.el.classList.toggle('sel', s.selected);
    }
    // Chips churn far less than the bars; rebuild only when the set changes.
    const key = s.chips.map((c) => (c.kind ?? '') + c.text).join('|');
    if (key !== this.chipKey) {
      this.chipKey = key;
      this.fx.replaceChildren(
        ...s.chips.map((c) => {
          const b = document.createElement('b');
          if (c.kind && c.kind !== 'plain') b.className = c.kind;
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
  place(x: number, y: number) {
    this.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
  }

  setVisible(v: boolean) {
    this.el.style.display = v ? 'flex' : 'none';
  }
}

// --- Visual-regression harness -------------------------------------------------
// Representative states; the gallery renders one banner per state so a snapshot
// covers the component's whole surface (both teams, every bar level, the chip
// kinds, selection) without the sim or the engine.
export const BANNER_GALLERY: { label: string; state: BannerState }[] = [
  { label: 'fresh / player', state: { team: 0, hp: 1, cohesion: 1, selected: false, chips: [] } },
  { label: 'fresh / enemy', state: { team: 1, hp: 1, cohesion: 1, selected: false, chips: [] } },
  { label: 'selected', state: { team: 0, hp: 0.86, cohesion: 0.93, selected: true, chips: [{ text: 'ATK', title: 'attacking' }, { text: 'CHG!', kind: 'hot', title: 'charging' }] } },
  {
    label: 'fighting',
    state: {
      team: 1, hp: 0.62, cohesion: 0.58, selected: false,
      chips: [{ text: 'ATK' }, { text: 'CHG!', kind: 'hot' }, { text: '⚔7', kind: 'hot' }],
    },
  },
  {
    label: 'breaking',
    state: {
      team: 0, hp: 0.24, cohesion: 0.12, selected: false,
      chips: [{ text: 'ROUT', kind: 'bad' }, { text: 'TIRED', kind: 'bad' }, { text: 'CRUSH', kind: 'bad' }],
    },
  },
  {
    label: 'ranged / dry',
    state: {
      team: 1, hp: 0.78, cohesion: 0.71, selected: false,
      chips: [{ text: 'KITE' }, { text: 'AMMO!', kind: 'bad' }, { text: '2nd', kind: 'hot' }],
    },
  },
];

/** Mount the gallery into a host element (used by the `?test=banners` route). */
export function mountBannerGallery(root: HTMLElement) {
  root.id = 'banner-gallery';
  for (const { label, state } of BANNER_GALLERY) {
    const cell = document.createElement('div');
    cell.className = 'ubanner-cell';
    const b = new UnitBanner();
    b.update(state);
    b.el.style.position = 'static';
    b.el.style.display = 'flex';
    b.el.style.transform = 'none';
    const cap = document.createElement('div');
    cap.className = 'ubanner-cap';
    cap.textContent = label;
    cell.append(b.el, cap);
    root.append(cell);
  }
}
