// Campaign panel data types + the #campaign-ui DOM shell. The panels themselves
// are React (web/src/ui/campaign/*), for both the live scene and the renderer-lab
// demo — the old innerHTML builders (armyPanelHtml/cityPanelHtml/diplomacyHtml/
// classBuilderHtml) were deleted once both consumers moved onto the components.

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
        max-height:calc(100vh - 54px);overflow:auto;
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
      #campaign-ui .cmp-roster { max-height:42vh;overflow:auto;margin:2px 0; }
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
    <!-- The top bar + every panel are React (web/src/ui/campaign/*), mounted by
         CampaignScene into these shells. -->
    <div id="cmp-topbar-root"></div>
    <div class="cmp-panel" id="cmp-army" style="display:none"></div>
    <div class="cmp-panel" id="cmp-city" style="display:none;top:auto;bottom:10px;"></div>
    <div class="cmp-sieges" id="cmp-sieges"></div>
    <div class="cmp-panel" id="cmp-diplomacy"
      style="display:none;left:10px;right:auto;top:44px;width:300px;max-height:84vh;overflow:auto;"></div>
    <div class="cmp-panel" id="cmp-classes"
      style="display:none;left:10px;right:auto;top:44px;width:520px;max-height:84vh;overflow:auto;"></div>
    <!-- Battle-decision modal (Fight / Auto-resolve) — React (CampaignBattleModal). -->
    <div id="cmp-modal-root"></div>`;
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
