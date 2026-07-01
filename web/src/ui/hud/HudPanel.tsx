import { Fragment } from "react";
import { type ArmySummary } from "../../battle/armySummary";

// The bottom-left info card (specs/done/hud-housings). A read-only ≤5Hz readout:
// BattleScene computes HudData each throttled tick and this renders it. Shows the
// selected/hovered unit when there is one, otherwise an army-roster summary so the
// card is never empty. (The old debug header — soldiers/fps/tick — is gone; FPS
// now lives in its own bare top-left readout, see BattleHud.)

export interface HudUnit {
  thumb?: string;
  cls: string;
  meta: string;
  hpFrac: number;
  hpColor: string;
  cohesion: number;
  fatigue: number;
  morale: number;
  detail: string[];
}

export interface HudData {
  /** The selected or hovered unit, if any. */
  unit?: HudUnit;
  /** Army-wide summary shown when no unit is selected/hovered. */
  roster?: ArmySummary;
}

function lines(list: string[]) {
  return list.map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

function Bar({ label, frac, color }: { label: string; frac: number; color: string }) {
  return (
    <div className="hud-stat">
      <span>{label}</span>
      <div className="hud-bar">
        <div style={{ width: `${(frac * 100).toFixed(0)}%`, background: color }} />
      </div>
    </div>
  );
}

/** Green→amber→red by fraction, matching the per-unit HP bar's thresholds. */
function strengthColor(frac: number) {
  return frac > 0.5 ? "#5cba46" : frac > 0.25 ? "#d6b13a" : "#cf4a3a";
}

function UnitReadout({ u }: { u: HudUnit }) {
  return (
    <>
      <div className="hud-head">
        {u.thumb ? <img className="hud-port" src={u.thumb} alt="" /> : null}
        <div>
          <div className="hud-name">{u.cls}</div>
          <div className="hud-meta">{u.meta}</div>
        </div>
      </div>
      <Bar label="HP" frac={u.hpFrac} color={u.hpColor} />
      <Bar label="COH" frac={u.cohesion} color="#d9c75a" />
      <Bar label="STA" frac={u.fatigue} color="#d9a13b" />
      <Bar label="MOR" frac={u.morale} color="#c2554e" />
      {u.detail.length ? <div className="hud-detail">{lines(u.detail)}</div> : null}
    </>
  );
}

function RosterReadout({ s }: { s: ArmySummary }) {
  const standing = s.routing > 0 ? `${s.routing} routing` : "holding the line";
  return (
    <>
      <div className="hud-head">
        <div>
          <div className="hud-name">Army</div>
          <div className="hud-meta">
            {s.unitsAlive}/{s.unitsTotal} units · {standing}
          </div>
        </div>
      </div>
      <Bar label="STR" frac={s.strengthFrac} color={strengthColor(s.strengthFrac)} />
      <Bar label="MOR" frac={s.morale} color="#c2554e" />
      <Bar label="COH" frac={s.cohesion} color="#d9c75a" />
    </>
  );
}

export function HudPanel({ data }: { data: HudData }) {
  if (data.unit) return <UnitReadout u={data.unit} />;
  if (data.roster) return <RosterReadout s={data.roster} />;
  return null;
}
