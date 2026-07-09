// Campaign panel data types + the #campaign-ui bronze DOM shell. The panels
// themselves are one React tree (web/src/ui/campaign/CampaignHud.tsx), shared by
// the live scene and the renderer-lab demo.

export type DiplomacyAction =
  | "declare_war"
  | "make_peace"
  | "propose_alliance"
  | "break_alliance"
  | "gift_gold";

export interface DiplomacyRow {
  id: number;
  name: string;
  color: [number, number, number];
  is_player: boolean;
  relation: "self" | "war" | "peace" | "alliance";
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
      :is(#campaign-ui, .renderer-campaign-ui) { color:var(--bronze-ink);font:12px ui-monospace,Menlo,monospace; }
      :is(#campaign-ui, .renderer-campaign-ui) :is(button, input, label) { font:inherit; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-top { position:fixed;top:8px;left:10px;right:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
        min-height:34px;padding:5px 8px;color:var(--bronze-ink);z-index:10;border-width:3px;box-sizing:border-box; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-readout { display:inline-flex;align-items:center;min-height:30px;padding:0 8px;
        color:var(--bronze-ink-bright);background:var(--well-bg);border:1px solid #3a2c18;border-radius:2px;box-shadow:var(--well-shadow);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      :is(#campaign-ui, .renderer-campaign-ui) #cmp-date { min-width:132px; }
      :is(#campaign-ui, .renderer-campaign-ui) #cmp-gold { min-width:220px;max-width:36vw;color:#f0d98a; }
      :is(#campaign-ui, .renderer-campaign-ui) button { display:inline-flex;align-items:center;justify-content:center;gap:5px;
        min-height:30px;padding:0 8px;cursor:pointer;color:var(--bronze-ink);background:var(--well-bg);border:1px solid #3a2c18;
        border-radius:2px;box-shadow:var(--well-shadow);box-sizing:border-box; }
      :is(#campaign-ui, .renderer-campaign-ui) button:not(:disabled):hover { color:var(--bronze-ink-bright);box-shadow:var(--well-hover); }
      :is(#campaign-ui, .renderer-campaign-ui) button.on { color:#1a130b;background:linear-gradient(#f0d98a,#c9a14e);border-color:#f0d98a;
        box-shadow:0 0 7px rgba(240,212,122,0.55); }
      :is(#campaign-ui, .renderer-campaign-ui) button:disabled { opacity:0.42;cursor:default; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-tool { width:30px;min-width:30px;padding:0; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-ico { width:15px;height:15px;fill:currentColor;flex:none;display:block; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-top .cmp-ico { width:17px;height:17px;color:currentColor; }
      /* Panel MATERIAL/shape is shared; PLACEMENT is game-scoped (#campaign-ui):
         the renderer-lab fixture positions the same panels absolutely inside its
         own box (apps/renderer-lab router fixture CSS). */
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-panel { width:244px;pointer-events:auto;
        overflow:auto;color:var(--bronze-ink);padding:11px;border-width:3px;z-index:10;box-sizing:border-box; }
      #campaign-ui .cmp-panel { position:fixed;right:10px;top:56px;max-height:calc(100vh - 66px); }
      #campaign-ui .cmp-panel--city { top:auto;bottom:10px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-panel--diplomacy { width:318px; }
      #campaign-ui .cmp-panel--diplomacy { left:10px;right:auto;top:56px;max-height:84vh; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-panel--classes { width:540px; }
      #campaign-ui .cmp-panel--classes { left:10px;right:auto;top:56px;max-height:84vh; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-panel b { font-family:Cinzel,Georgia,serif;letter-spacing:0.2px;color:#f1dfb1; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-title { display:flex;align-items:center;gap:7px;margin-bottom:7px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-title .cmp-ico { width:17px;height:17px;color:#f0d98a; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-city-meta,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-class-meta,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-siege-sub { color:#cbb88e;font-size:11px;line-height:1.3; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-stat { display:grid;grid-template-columns:76px 1fr;gap:8px;align-items:center;margin:5px 0; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-stat span:first-child { color:#cbb88e;text-transform:uppercase;font-size:10px;letter-spacing:0.4px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-bar { height:7px;background:#170d08;border:1px solid #342313;border-radius:2px;box-shadow:var(--well-shadow);overflow:hidden; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-bar > div { height:100%;background:linear-gradient(90deg,#7fbd57,#d6b13a); }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-policy { display:grid;gap:6px;margin:8px 0; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-policy label { display:grid;gap:4px;color:#d8c59a; }
      :is(#campaign-ui, .renderer-campaign-ui) input[type="range"] { width:100%;accent-color:#d9b45c; }
      :is(#campaign-ui, .renderer-campaign-ui) input[type="checkbox"] { appearance:none;width:14px;height:14px;margin:0 5px 0 0;
        vertical-align:-2px;background:var(--well-bg);border:1px solid #3a2c18;border-radius:2px;box-shadow:var(--well-shadow); }
      :is(#campaign-ui, .renderer-campaign-ui) input[type="checkbox"]:checked { background:linear-gradient(#f0d98a,#c9a14e);box-shadow:0 0 6px rgba(240,212,122,0.5); }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-roster { max-height:42vh;overflow:auto;display:grid;gap:5px;margin:4px 0 8px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-roster-row,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-diplo-row,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-unit,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-side { background:var(--well-bg);border:1px solid #3a2c18;border-radius:2px;box-shadow:var(--well-shadow); }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-roster-row { display:block;padding:6px;color:#eadfca; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-army-actions,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-recruits,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-diplo-acts,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-size,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-actions { display:flex;gap:5px;flex-wrap:wrap; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-army-actions { margin-top:8px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-diplo-row { display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0;padding:7px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-swatch { width:12px;height:12px;border-radius:1px;flex:none;box-shadow:0 0 0 1px #120b07,0 0 0 2px #70552d; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-rel { font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;padding:2px 5px;border:1px solid #3a2c18;border-radius:2px;box-shadow:var(--well-shadow); }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-rel.war { color:#ff9a8a;background:#3a1410; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-rel.peace { color:#eadfca;background:#26170d; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-rel.alliance { color:#b9dc8b;background:#1d2612; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-pow { color:#cbb88e;font-size:11px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-pow .cmp-ico { width:11px;height:11px;margin:0 2px 0 5px;color:#d9b45c;vertical-align:-2px;display:inline; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-diplo-acts { margin-top:2px;flex-basis:100%; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-diplo-acts button { font-size:11px;min-height:24px;padding:0 7px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-class-row { display:grid;grid-template-columns:132px 1fr;gap:10px;padding:9px 0;border-top:1px solid #6b4c25; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-class-name { font-family:Cinzel,Georgia,serif;font-weight:700;color:#f0dcab; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-unit-options { display:flex;flex-direction:column;gap:5px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-unit { display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:7px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-unit.sel { border-color:#f0d98a;box-shadow:0 0 7px rgba(240,212,122,0.5),var(--well-shadow); }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-unit small { color:#cbb88e; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-size { margin-top:6px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-size button { min-height:24px;padding:0 7px;font-size:11px; }
      :is(#campaign-ui, .renderer-campaign-ui) button[data-apply] { margin-top:7px;width:100%;font-size:11px;min-height:25px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-recruits { margin-top:8px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-recruits button { min-height:26px;font-size:11px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-sieges { position:fixed;right:10px;top:50%;transform:translateY(-50%);width:244px;display:flex;flex-direction:column;gap:8px;z-index:15;pointer-events:none; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-siege { pointer-events:auto;cursor:pointer;color:#f3e3c4;font:12px ui-monospace,Menlo,monospace;padding:8px 10px;border-width:3px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-siege-title { display:flex;align-items:center;gap:6px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-siege b { font-family:Cinzel,Georgia,serif;color:#ffd9a0; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-cards { position:fixed;inset:0;z-index:8;pointer-events:none;overflow:hidden; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card { position:absolute;left:0;top:0;display:none;min-width:56px;max-width:118px;
        pointer-events:none;color:var(--bronze-ink);border:2px solid transparent;border-radius:5px;
        background:var(--bronze-fill) padding-box,var(--bronze-edge) border-box;box-shadow:var(--bronze-frame);
        overflow:hidden;will-change:transform;box-sizing:border-box; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card__band { height:3px;background:var(--cmp-card-faction);box-shadow:inset 0 -1px 0 rgba(0,0,0,0.5); }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card__body { display:flex;flex-direction:column;gap:2px;padding:3px 7px 4px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card__name { color:var(--bronze-ink-bright);font:700 10.5px/1.1 Cinzel,Georgia,serif;
        letter-spacing:1px;text-transform:uppercase;text-shadow:0 1px 0 rgba(0,0,0,0.65);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card__income,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card__strength { display:flex;align-items:center;gap:4px;color:var(--bronze-ink);
        font:10.5px/1 Georgia,'Times New Roman',serif;font-variant-numeric:tabular-nums;white-space:nowrap; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card__coin { width:7px;height:7px;border-radius:50%;flex:none;
        background:radial-gradient(circle at 35% 30%,#f6dd9a,#c9973f 60%,#7a5417);box-shadow:0 0 0 1px rgba(60,38,8,0.8); }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card__garrison { display:flex;align-items:center;gap:5px;padding:2px 7px 3px;
        background:rgba(0,0,0,0.14);border-top:1px solid rgba(20,9,4,0.8);box-shadow:inset 0 1px 0 rgba(150,104,54,0.35);
        color:#d8bd8d;font:9.5px/1 Georgia,'Times New Roman',serif;letter-spacing:0.7px;white-space:nowrap; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-map-card__garrison b { min-width:0;overflow:hidden;text-overflow:ellipsis;
        color:var(--bronze-ink-bright);font-family:Cinzel,Georgia,serif;font-size:9.5px;letter-spacing:0.8px;text-transform:uppercase; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-modal { position:fixed;inset:0;background:rgba(0,0,0,0.48);display:flex;align-items:center;justify-content:center;z-index:20; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-box { color:var(--bronze-ink);padding:22px 30px;font:14px ui-monospace,Menlo,monospace;text-align:center;min-width:380px;border-width:4px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-box h2,
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-side h3 { font-family:Cinzel,Georgia,serif;color:#f1dfb1;margin:0 0 8px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-sides { display:flex;gap:14px;justify-content:center;margin:12px 0; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-side { min-width:140px;padding:10px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-warn { color:#ff9a8a;font-weight:bold;margin-top:6px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-actions { justify-content:center;margin-top:12px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-actions button { font-size:14px;min-height:34px;padding:0 18px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-menu-box { min-width:min(390px,92vw); }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-menu-box .cmp-actions { display:grid;gap:8px; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-menu-box .cmp-actions button { width:100%; }
      :is(#campaign-ui, .renderer-campaign-ui) .cmp-menu-box .watch { background:none;border:none;box-shadow:none;color:#9c8048;font-size:12px; }
      @media (max-width:1100px) {
        #campaign-ui .cmp-panel,
        #campaign-ui .cmp-panel--diplomacy,
        #campaign-ui .cmp-panel--classes { top:96px;max-height:calc(100vh - 106px); }
        #campaign-ui .cmp-panel--city { top:auto;bottom:10px; }
      }
    </style>
    <div id="cmp-hud-root"></div>`;
}

export function prettyClass(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function classSort(name: string): number {
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
