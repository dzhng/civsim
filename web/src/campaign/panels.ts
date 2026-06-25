import type { CampaignData } from './data';
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

export function campaignDomHtml(): string {
  return `
    <style>
      #campaign-ui .cmp-top { position:fixed;top:0;left:0;right:0;display:flex;gap:14px;align-items:center;
        padding:6px 12px;background:rgba(12,16,22,0.85);color:#e8e0cc;font:13px system-ui;z-index:10; }
      #campaign-ui button { background:#2a3242;color:#e8e0cc;border:1px solid #4a5468;border-radius:3px;
        padding:3px 10px;cursor:pointer;font:12px system-ui; }
      #campaign-ui button.on { background:#5a6a8a; }
      #campaign-ui .cmp-panel { position:fixed;right:10px;top:44px;width:230px;background:rgba(12,16,22,0.9);
        color:#e8e0cc;font:12px system-ui;padding:10px;border-radius:4px;z-index:10; }
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
      #campaign-ui .cmp-diplo-acts { display:flex;gap:4px;margin-top:2px;flex-wrap:wrap;flex-basis:100%; }
      #campaign-ui .cmp-diplo-acts button { font-size:11px;padding:2px 7px; }
    </style>
    <div class="cmp-top">
      <span id="cmp-date">Day 1</span>
      <span id="cmp-gold">0 gold</span>
      <button id="cmp-pause">⏸</button>
      <button data-speed="0">1×</button>
      <button data-speed="1">3×</button>
      <button data-speed="2">10×</button>
      <button id="cmp-factions" title="Toggle faction (political) view — V">🗺 Factions</button>
      <button id="cmp-fog" title="Toggle fog of war — F">🌫 Fog</button>
      <button id="cmp-diplo-btn">⚑ Diplomacy</button>
      <span style="flex:1"></span>
      <button id="cmp-save">Save</button>
      <button id="cmp-exit">Menu</button>
    </div>
    <div class="cmp-panel" id="cmp-army" style="display:none"></div>
    <div class="cmp-panel" id="cmp-city" style="display:none;top:auto;bottom:10px;"></div>
    <div class="cmp-panel" id="cmp-diplomacy"
      style="display:none;left:10px;right:auto;top:44px;width:300px;max-height:84vh;overflow:auto;"></div>`;
}

export function diplomacyHtml(list: DiplomacyRow[]): string {
  const rows = list
    .map((f) => {
      const col = `rgb(${f.color[0]},${f.color[1]},${f.color[2]})`;
      const pow = `<span class="cmp-pow">${f.cities}🏛 ${f.soldiers}⚔</span>`;
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
  return `<b>Diplomacy</b>${rows}`;
}

export function armyPanelHtml(
  selected: number,
  roster: ArmyRosterRow[],
  me: ArmyView | undefined,
  buddy: ArmyView | undefined,
  spotIdx: number,
): string {
  const rows = roster
    .map((r, i) =>
      r.count > 0
        ? `<div><label><input type="checkbox" data-entry="${i}"> ${r.class}: ${r.count}/${r.max} (morale ${Math.round(r.morale_cap * 100)}%)</label></div>`
        : '')
    .join('');
  const ambushLabel = me?.stance === 3 ? 'Hidden' : me?.stance === 2 ? 'Settling…' : 'Ambush';
  return `<b>Army ${selected}</b>${rows}<div style="margin-top:6px">
    <button id="cmp-halt">Halt</button>
    <button id="cmp-camp">${me?.stance === 1 ? 'Camped' : 'Camp'}</button>
    ${spotIdx >= 0 || (me && me.stance >= 2 && me.stance <= 3) ? `<button id="cmp-ambush" ${me!.stance >= 2 ? 'disabled' : ''}>${ambushLabel}</button>` : ''}
    <button id="cmp-split">Split</button>
    ${buddy ? `<button id="cmp-merge">Merge ${buddy.id}</button>` : ''}</div>`;
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
    ? `<div style="margin-top:6px">${recruitClasses
        .map((cl, i) => `<button data-recruit="${i}" title="${cl}">${cl.replace(/[a-z]/g, '')}</button>`)
        .join(' ')}</div>`
    : '';
  const buildings = detail
    ? buildRow(detail, mineCity, 0, 'Market', detail.market_lvl, [200, 300])
      + buildRow(detail, mineCity, 1, 'Barracks', detail.barracks_lvl, [250, 400])
    : '';
  return `<b>${n.name}</b> (tier ${n.tier}) — ${data.map.factions[city.owner]?.name ?? '?'}
    <div>garrison ${city.garrison}${city.queue ? ` | recruiting ${city.queue}` : ''}</div>${buildings}${recruits}`;
}

export function roadPanelHtml(edgeTiles: number, lvl: number, job: number): string {
  const cost = 15 * edgeTiles;
  const status =
    job >= 0
      ? `paving… ${Math.ceil(job / 60)}h left`
      : lvl >= 3
        ? 'fully paved'
        : `<button id="cmp-road-up">Upgrade (${cost} gold)</button>`;
  return `<b>Road</b> (${edgeTiles} tiles) — level ${lvl}<div style="margin-top:6px">${status}</div>`;
}

export interface CityDetail {
  market_lvl: number;
  barracks_lvl: number;
  building: 'market' | 'barracks' | null;
  build_ticks_left: number;
}

function actionButton(act: DiplomacyAction, f: number, label: string): string {
  return `<button data-act="${act}" data-f="${f}">${label}</button>`;
}

function buildRow(detail: CityDetail, mineCity: boolean, kind: number, name: string, lvl: number, costs: number[]): string {
  if (detail.building) {
    return detail.building === name.toLowerCase()
      ? `<div>${name} L${lvl} — building, ${Math.ceil(detail.build_ticks_left / 1440)}d left</div>`
      : `<div>${name} L${lvl}</div>`;
  }
  return lvl < 2 && mineCity
    ? `<div>${name} L${lvl} <button data-build="${kind}">+ (${costs[lvl]}g)</button></div>`
    : `<div>${name} L${lvl}</div>`;
}
