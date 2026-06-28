import type { CampaignData } from './data';
import { uiIcon } from './icons';
import type { ArmyView, CityView } from './views';

export type DiplomacyAction = 'declare_war' | 'make_peace' | 'propose_alliance' | 'break_alliance' | 'gift_gold';

export interface DiplomacyRow {
  id: number;
  name: string;
  color: [number, number, number];
  is_player: boolean;
  relation: 'self' | 'war' | 'peace' | 'alliance';
  cities: number;
  soldiers: number;
}

export interface ArmyRosterRow {
  class: string;
  count: number;
  max: number;
  morale_cap: number;
}

export interface UnitOptionRow {
  id: number;
  name: string;
  costPerSoldier: number;
  upkeepPerSoldier: number;
  recruitTicksPerSoldier: number;
  option: number;
  unlocked: boolean;
  applyCost: number | null;
}

export interface ClassDoctrineRow {
  classIndex: number;
  class: string;
  selected: number;
  sizeMult: number;
  cooldown: number;
  live: number;
  max: number;
  options: UnitOptionRow[];
  dirty?: boolean;
}

export function campaignDomHtml(): string {
  return `
    <style>
      #campaign-ui .cmp-top { position:fixed;top:0;left:0;right:0;display:flex;gap:14px;align-items:center;
        padding:6px 12px;background:rgba(12,16,22,0.85);color:#e8e0cc;font:13px system-ui;z-index:10; }
      #campaign-ui button { background:#2a3242;color:#e8e0cc;border:1px solid #4a5468;border-radius:3px;
        padding:3px 10px;cursor:pointer;font:12px system-ui;display:inline-flex;align-items:center;gap:5px; }
      #campaign-ui button.on { background:#5a6a8a; }
      #campaign-ui .cmp-ico { width:14px;height:14px;fill:currentColor;flex:none;filter:drop-shadow(0 1px 0 rgba(0,0,0,0.35)); }
      #campaign-ui .cmp-top button .cmp-ico { width:15px;height:15px;color:#d9c28f; }
      #campaign-ui #cmp-pause { min-width:30px;justify-content:center;padding:3px 7px; }
      #campaign-ui #cmp-pause .cmp-ico { margin:0; }
      #campaign-ui .cmp-panel { position:fixed;right:10px;top:44px;width:230px;
        background:linear-gradient(180deg,rgba(31,27,21,0.96),rgba(14,16,18,0.96));
        color:#eadfca;font:12px system-ui;padding:10px;border:1px solid rgba(151,122,72,0.55);
        box-shadow:0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,236,186,0.12);
        border-radius:3px;z-index:10; }
      #campaign-ui .cmp-panel b { font-family:Cinzel, Georgia, serif;letter-spacing:0.2px;color:#f1dfb1; }
      #campaign-ui .cmp-title { display:flex;align-items:center;gap:6px;margin-bottom:4px; }
      #campaign-ui .cmp-title .cmp-ico { width:16px;height:16px;color:#caa45c; }
      #campaign-ui input[type="checkbox"] { accent-color:#b38a43; }
      #campaign-ui .cmp-modal { position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;
        align-items:center;justify-content:center;z-index:20; }
      #campaign-ui .cmp-box { background:#161c26;color:#e8e0cc;padding:22px 30px;border-radius:6px;
        font:14px system-ui;text-align:center;min-width:380px; }
      #campaign-ui .cmp-sides { display:flex;gap:30px;justify-content:center;margin:12px 0; }
      #campaign-ui .cmp-warn { color:#ff7a6a;font-weight:bold;margin-top:6px; }
      #campaign-ui .cmp-actions { display:flex;gap:12px;justify-content:center;margin-top:10px; }
      #campaign-ui .cmp-actions button { font-size:15px;padding:8px 22px; }
      #campaign-ui .cmp-diplo-row { display:flex;flex-wrap:wrap;align-items:center;gap:6px;
        margin:5px 0;padding:6px;border-radius:3px;background:rgba(255,255,255,0.05); }
      #campaign-ui .cmp-swatch { width:12px;height:12px;border-radius:2px;flex:none;
        box-shadow:0 0 0 1px rgba(0,0,0,0.4); }
      #campaign-ui .cmp-rel { font-size:9px;font-weight:bold;text-transform:uppercase;
        letter-spacing:0.5px;padding:1px 5px;border-radius:2px; }
      #campaign-ui .cmp-rel.war { background:#5a2330;color:#ff9a8a; }
      #campaign-ui .cmp-rel.peace { background:#2a3a4a;color:#9ec5e8; }
      #campaign-ui .cmp-rel.alliance { background:#2a4a32;color:#9ee8a8; }
      #campaign-ui .cmp-pow { opacity:0.6;font-size:11px; }
      #campaign-ui .cmp-pow .cmp-ico { width:11px;height:11px;margin:0 2px 0 5px;color:#c6ad76;vertical-align:-2px; }
      #campaign-ui .cmp-diplo-acts { display:flex;gap:4px;margin-top:2px;flex-wrap:wrap;flex-basis:100%; }
      #campaign-ui .cmp-diplo-acts button { font-size:11px;padding:2px 7px; }
      #campaign-ui .cmp-class-row { display:grid;grid-template-columns:132px 1fr;gap:10px;
        padding:9px 0;border-top:1px solid rgba(169,133,76,0.3); }
      #campaign-ui .cmp-class-name { font-family:Cinzel, Georgia, serif;font-weight:700;color:#f0dcab; }
      #campaign-ui .cmp-class-meta { color:#b9aa8b;font-size:11px;margin-top:2px;line-height:1.25; }
      #campaign-ui .cmp-unit-options { display:flex;flex-direction:column;gap:4px; }
      #campaign-ui .cmp-unit { display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;
        background:rgba(42,36,28,0.84);padding:6px;border:1px solid rgba(119,94,55,0.35);border-radius:3px; }
      #campaign-ui .cmp-unit.sel { background:rgba(81,64,37,0.96);border-color:rgba(194,154,82,0.72); }
      #campaign-ui .cmp-unit small { color:#bfb39a; }
      #campaign-ui .cmp-unit button, #campaign-ui .cmp-size button, #campaign-ui button[data-apply] {
        background:#202631;border-color:#6c5b3e;color:#eadfca; }
      #campaign-ui .cmp-unit button:not(:disabled):hover, #campaign-ui .cmp-size button:not(:disabled):hover {
        background:#3a3124;border-color:#b38a43; }
      #campaign-ui .cmp-unit button:disabled { opacity:0.82; }
      #campaign-ui .cmp-size { display:flex;gap:4px;margin-top:5px; }
      #campaign-ui .cmp-size button { padding:1px 6px;font-size:11px; }
      #campaign-ui button[data-apply] { margin-top:6px;width:100%;font-size:11px;padding:3px 6px; }
      #campaign-ui .cmp-build-row { display:flex;align-items:center;gap:6px;margin-top:4px; }
      #campaign-ui .cmp-build-row > span { flex:1; }
      #campaign-ui .cmp-city-meta { color:#b9aa8b;margin-top:3px;line-height:1.25; }
      #campaign-ui .cmp-recruits { display:flex;gap:4px;flex-wrap:wrap;margin-top:6px; }
      #campaign-ui .cmp-sieges { position:fixed;right:10px;top:50%;transform:translateY(-50%);
        width:230px;display:flex;flex-direction:column;gap:8px;z-index:15;pointer-events:none; }
      #campaign-ui .cmp-siege { pointer-events:auto;cursor:pointer;color:#f3e3c4;font:12px system-ui;
        padding:8px 10px;border-radius:3px;border:1px solid rgba(196,108,82,0.7);
        background:linear-gradient(180deg,rgba(58,28,24,0.96),rgba(26,16,14,0.96));
        box-shadow:0 8px 22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,196,150,0.12); }
      #campaign-ui .cmp-siege:hover { border-color:#e08a5a; }
      #campaign-ui .cmp-siege b { font-family:Cinzel, Georgia, serif;color:#ffd9a0; }
      #campaign-ui .cmp-siege-sub { color:#d7b69a;font-size:11px;margin-top:2px; }
    </style>
    <div class="cmp-top">
      <span id="cmp-date">Day 1</span>
      <span id="cmp-gold">0 gold</span>
      <button id="cmp-pause" title="Pause">${uiIcon('pause')}</button>
      <button data-speed="0">1×</button>
      <button data-speed="1">3×</button>
      <button data-speed="2">10×</button>
      <button id="cmp-factions" title="Toggle faction (political) view — V">${uiIcon('map')} Factions</button>
      <button id="cmp-fog" title="Toggle fog of war — F">${uiIcon('cloudFog')} Fog</button>
      <button id="cmp-diplo-btn">${uiIcon('flag')} Diplomacy</button>
      <button id="cmp-classes-btn">${uiIcon('shield')} Classes</button>
      <span style="flex:1"></span>
      <button id="cmp-save">${uiIcon('save')} Save</button>
      <button id="cmp-exit">${uiIcon('door')} Menu</button>
    </div>
    <div class="cmp-panel" id="cmp-army" style="display:none"></div>
    <div class="cmp-panel" id="cmp-city" style="display:none;top:auto;bottom:10px;"></div>
    <div class="cmp-sieges" id="cmp-sieges"></div>
    <div class="cmp-panel" id="cmp-diplomacy"
      style="display:none;left:10px;right:auto;top:44px;width:300px;max-height:84vh;overflow:auto;"></div>
    <div class="cmp-panel" id="cmp-classes"
      style="display:none;left:10px;right:auto;top:44px;width:520px;max-height:84vh;overflow:auto;"></div>`;
}

export function diplomacyHtml(list: DiplomacyRow[]): string {
  const rows = list
    .map((f) => {
      const col = `rgb(${f.color[0]},${f.color[1]},${f.color[2]})`;
      const pow = `<span class="cmp-pow">${uiIcon('city')}${f.cities} ${uiIcon('sword')}${f.soldiers}</span>`;
      if (f.is_player) {
        return `<div class="cmp-diplo-row"><span class="cmp-swatch" style="background:${col}"></span>
          <b>${f.name}</b> <span class="cmp-pow">(you)</span><span style="flex:1"></span>${pow}</div>`;
      }
      const acts: string[] = [];
      if (f.relation === 'war') acts.push(actionButton('make_peace', f.id, 'Sue for peace'));
      if (f.relation === 'peace') {
        acts.push(actionButton('declare_war', f.id, 'Declare war'));
        acts.push(actionButton('propose_alliance', f.id, 'Propose alliance'));
      }
      if (f.relation === 'alliance') acts.push(actionButton('break_alliance', f.id, 'Break alliance'));
      acts.push(actionButton('gift_gold', f.id, 'Gift 200g'));
      return `<div class="cmp-diplo-row">
        <span class="cmp-swatch" style="background:${col}"></span>
        <b>${f.name}</b> <span class="cmp-rel ${f.relation}">${f.relation}</span>
        <span style="flex:1"></span>${pow}
        <div class="cmp-diplo-acts">${acts.join('')}</div>
      </div>`;
    })
    .join('');
  return `<div class="cmp-title">${uiIcon('flag')}<b>Diplomacy</b></div>${rows}`;
}

export function armyPanelHtml(
  selected: number,
  roster: ArmyRosterRow[],
  me: ArmyView | undefined,
  buddy: ArmyView | undefined,
  spotIdx: number,
  autoReplenish: boolean,
): string {
  const rows = roster
    .map((r, i) =>
      r.count > 0
        ? `<div><label><input type="checkbox" data-entry="${i}"> ${prettyClass(r.class)}: ${r.count}/${r.max} (morale ${Math.round(r.morale_cap * 100)}%)</label></div>`
        : '')
    .join('');
  const ambushLabel = me?.stance === 3 ? 'Hidden' : me?.stance === 2 ? 'Settling…' : 'Ambush';
  return `<div class="cmp-title">${uiIcon('flag')}<b>Army ${selected}</b></div>${rows}<div style="margin-top:6px">
    <label><input type="checkbox" id="cmp-auto-replenish" ${autoReplenish ? 'checked' : ''}> ${uiIcon('replenish')} Auto replenish</label><br>
    <button id="cmp-halt">${uiIcon('stop')} Halt</button>
    <button id="cmp-camp">${uiIcon('shield')} ${me?.stance === 1 ? 'Fortified' : 'Fortify'}</button>
    ${spotIdx >= 0 || (me && me.stance >= 2 && me.stance <= 3) ? `<button id="cmp-ambush" ${me!.stance >= 2 ? 'disabled' : ''}>${ambushLabel}</button>` : ''}
    <button id="cmp-split">${uiIcon('split')} Split</button>
    ${buddy ? `<button id="cmp-merge">${uiIcon('split')} Merge ${buddy.id}</button>` : ''}</div>`;
}

export function classBuilderHtml(rows: ClassDoctrineRow[]): string {
  const sorted = [...rows].sort((a, b) => classSort(a.class) - classSort(b.class));
  return `<div class="cmp-title">${uiIcon('shield')}<b>Class Builder</b></div>${sorted.map(classRow).join('')}`;
}

function classRow(row: ClassDoctrineRow): string {
  const className = prettyClass(row.class);
  const currentSize = row.sizeMult;
  const selectedName = row.options.find((o) => o.id === row.selected)?.name ?? 'Unknown';
  const sizes = [1, 2, 3]
    .map((s) =>
      `<button data-class="${row.classIndex}" data-size="${s}" ${s === currentSize ? 'class="on"' : ''}>${s}x</button>`,
    )
    .join('');
  const options = row.options
    .map((o) => {
      const sel = o.id === row.selected;
      const disabled = !o.unlocked || row.cooldown > 0;
      const cost = o.applyCost == null ? 'cooldown' : `${o.applyCost}g`;
      return `<div class="cmp-unit ${sel ? 'sel' : ''}">
        <div><b>${o.name}</b><br><small>${o.costPerSoldier.toFixed(2)}g recruit · ${o.upkeepPerSoldier.toFixed(3)}g upkeep/day</small></div>
        <button data-class="${row.classIndex}" data-unit="${o.id}" ${disabled || sel ? 'disabled' : ''}>${sel ? uiIcon('check') + ' Selected' : cost}</button>
      </div>`;
    })
    .join('');
  return `<div class="cmp-class-row">
    <div><div class="cmp-class-name">${className}</div><div class="cmp-class-meta">${row.live}/${row.max} · ${selectedName}${row.cooldown > 0 ? ` · ${Math.ceil(row.cooldown / 1440)}d` : ''}</div>
      <div class="cmp-size">${sizes}</div>${row.dirty ? `<button data-apply="${row.classIndex}">${uiIcon('check')} Apply</button>` : ''}</div>
    <div class="cmp-unit-options">${options}</div>
  </div>`;
}

function prettyClass(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function classSort(name: string): number {
  const order: Record<string, number> = {
    Peasant: 0,
    LightSword: 10,
    LightSpear: 11,
    MediumInfantry: 20,
    MediumSpear: 21,
    MediumPhalanx: 22,
    HeavySword: 30,
    HeavySpear: 31,
    LongSwords: 40,
    HeavyPhalanx: 41,
    Archers: 50,
    Skirmishers: 51,
    ShockCavalry: 60,
    HorseArchers: 61,
    ArtilleryCrew: 70,
  };
  return order[name] ?? 999;
}

export function cityPanelHtml(
  data: CampaignData,
  node: number,
  city: CityView,
  mineCity: boolean,
  detail: CityDetail,
  recruitClasses: string[],
): string {
  const n = data.map.nodes[node];
  const recruits = mineCity
    ? `<div class="cmp-recruits">${recruitClasses
        .map((cl, i) => `<button data-recruit="${i}" title="${cl}">${uiIcon('add')} ${cl.replace(/[a-z]/g, '')}</button>`)
        .join('')}</div>`
    : '';
  const policy = detail ? policyHtml(detail, mineCity) : '';
  const pct = detail ? Math.round((100 * detail.population) / Math.max(1, detail.pop_cap)) : 0;
  const meta = detail
    ? `<div class="cmp-city-meta">pop ${detail.population.toLocaleString()} (${pct}% of cap) — loyalty ${Math.round(detail.loyalty * 100)}%</div>
       <div class="cmp-city-meta">income ${detail.monthly_income.toLocaleString()}/mo</div>`
    : '';
  return `<div class="cmp-title">${uiIcon('city')}<b>${n.name}</b></div>
    <div class="cmp-city-meta">tier ${n.tier} — ${data.map.factions[city.owner]?.name ?? '?'}</div>
    <div class="cmp-city-meta">garrison ${city.garrison}${city.queue ? ` | recruiting ${city.queue}` : ''}</div>${meta}${policy}${recruits}`;
}

export interface CityDetail {
  population: number;
  pop_cap: number;
  focus: number; // -1 Economy .. +1 Military
  throttle: number; // 0 Grow .. 1 Exploit
  econ_dev: number;
  mil_dev: number;
  loyalty: number;
  monthly_income: number;
}

/** The two policy dials that replace the build menu. */
function policyHtml(detail: CityDetail, mineCity: boolean): string {
  if (!mineCity) {
    return `<div class="cmp-city-meta">focus ${focusLabel(detail.focus)} — ${throttleLabel(detail.throttle)}</div>`;
  }
  return `<div class="cmp-policy">
    <label>Economy ↔ Military
      <input type="range" data-policy="focus" min="-1" max="1" step="0.1" value="${detail.focus}">
    </label>
    <label>Grow ↔ Exploit
      <input type="range" data-policy="throttle" min="0" max="1" step="0.1" value="${detail.throttle}">
    </label>
  </div>`;
}

function focusLabel(focus: number): string {
  if (focus < -0.33) return 'Economy';
  if (focus > 0.33) return 'Military';
  return 'Balanced';
}
function throttleLabel(throttle: number): string {
  return throttle > 0.5 ? 'Exploit' : 'Grow';
}

function actionButton(act: DiplomacyAction, f: number, label: string): string {
  return `<button data-act="${act}" data-f="${f}">${label}</button>`;
}
