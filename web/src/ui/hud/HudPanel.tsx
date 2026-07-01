import { Fragment } from 'react';

// S6c: the top-left unit info panel (#hud) as React — a read-only ≤5Hz readout.
// BattleScene computes HudData each throttled tick (the same fields the old
// updateHud built into an innerHTML string) and this renders it. Multi-line text
// uses <br> between lines exactly like the old `lines.join('<br>')`; detail lines
// already have their leading indent as a real non-breaking space (was &nbsp;).

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
  header: string[];
  unit?: HudUnit;
}

function lines(list: string[]) {
  return list.map((line, i) => (
    <Fragment key={i}>{i > 0 ? <br /> : null}{line}</Fragment>
  ));
}

function Bar({ label, frac, color }: { label: string; frac: number; color: string }) {
  return (
    <div className="hud-stat">
      <span>{label}</span>
      <div className="hud-bar"><div style={{ width: `${(frac * 100).toFixed(0)}%`, background: color }} /></div>
    </div>
  );
}

export function HudPanel({ data }: { data: HudData }) {
  const u = data.unit;
  return (
    <>
      {lines(data.header)}
      {u ? (
        <>
          <div className="hud-head">
            {u.thumb ? <img className="hud-port" src={u.thumb} alt="" /> : null}
            <div><div className="hud-name">{u.cls}</div><div className="hud-meta">{u.meta}</div></div>
          </div>
          <Bar label="HP" frac={u.hpFrac} color={u.hpColor} />
          <Bar label="COH" frac={u.cohesion} color="#d9c75a" />
          <Bar label="STA" frac={u.fatigue} color="#d9a13b" />
          <Bar label="MOR" frac={u.morale} color="#c2554e" />
          {u.detail.length ? <div className="hud-detail">{lines(u.detail)}</div> : null}
        </>
      ) : null}
    </>
  );
}
