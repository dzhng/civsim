import type { CSSProperties } from 'react';
import type { DiplomacyAction, DiplomacyRow } from '../../campaign/panels';
import { UiIcon } from './UiIcon';

// S5c: the diplomacy panel (#cmp-diplomacy) as React — ported 1:1 from
// diplomacyHtml. Each .cmp-diplo-row is a flex container (gap-spaced), so the
// only thing that matters is the elements in order; the scene feeds the faction
// list and dispatches the chosen action back to wasm.
export interface DiplomacyPanelProps {
  list: DiplomacyRow[];
  onAction(act: DiplomacyAction, other: number): void;
}

const spacer: CSSProperties = { flex: 1 };

export function DiplomacyPanel({ list, onAction }: DiplomacyPanelProps) {
  return (
    <>
      <div className="cmp-title"><UiIcon name="flag" /><b>Diplomacy</b></div>
      {list.map((f) => {
        const col = `rgb(${f.color[0]},${f.color[1]},${f.color[2]})`;
        const pow = (
          <span className="cmp-pow"><UiIcon name="city" />{f.cities} <UiIcon name="sword" />{f.soldiers}</span>
        );
        if (f.is_player) {
          return (
            <div className="cmp-diplo-row" key={f.id}>
              <span className="cmp-swatch" style={{ background: col }} />
              <b>{f.name}</b> <span className="cmp-pow">(you)</span><span style={spacer} />{pow}
            </div>
          );
        }
        const acts: { act: DiplomacyAction; label: string }[] = [];
        if (f.relation === 'war') acts.push({ act: 'make_peace', label: 'Sue for peace' });
        if (f.relation === 'peace') {
          acts.push({ act: 'declare_war', label: 'Declare war' });
          acts.push({ act: 'propose_alliance', label: 'Propose alliance' });
        }
        if (f.relation === 'alliance') acts.push({ act: 'break_alliance', label: 'Break alliance' });
        acts.push({ act: 'gift_gold', label: 'Gift 200g' });
        return (
          <div className="cmp-diplo-row" key={f.id}>
            <span className="cmp-swatch" style={{ background: col }} />
            <b>{f.name}</b> <span className={`cmp-rel ${f.relation}`}>{f.relation}</span>
            <span style={spacer} />{pow}
            <div className="cmp-diplo-acts">
              {acts.map((a) => (
                <button key={a.act} data-act={a.act} data-f={f.id} onClick={() => onAction(a.act, f.id)}>{a.label}</button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
