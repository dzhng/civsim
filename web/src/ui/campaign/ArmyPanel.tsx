import { useEffect, useState } from 'react';
import { prettyClass, type ArmyRosterRow } from '../../campaign/panels';
import type { ArmyView } from '../../campaign/views';
import { UiIcon } from './UiIcon';

// S5b: the selected-army panel (#cmp-army) as React — ported 1:1 from
// armyPanelHtml so the slate #campaign-ui CSS still styles it. The split
// selection (which roster entries to peel off) is React state; the rest is
// data-in / action-out from CampaignScene.
export interface ArmyPanelProps {
  armyId: number;
  roster: ArmyRosterRow[];
  me: ArmyView | undefined;
  buddy: ArmyView | undefined;
  spotIdx: number;
  autoReplenish: boolean;
  onAutoReplenish(on: boolean): void;
  onHalt(): void;
  onAmbush(): void;
  onCamp(): void;
  onSplit(mask: number): void;
  onMerge(): void;
}

export function ArmyPanel(p: ArmyPanelProps) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  // Clear the split selection whenever the army or its roster changes (a split
  // renumbers entries) — the vanilla rebuilt the checkboxes fresh each update.
  const rosterSig = p.armyId + ':' + p.roster.map((r) => r.count).join(',');
  useEffect(() => { setChecked(new Set()); }, [rosterSig]);
  const toggle = (i: number) => setChecked((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });
  const stance = p.me?.stance;
  const ambushLabel = stance === 3 ? 'Hidden' : stance === 2 ? 'Settling…' : 'Ambush';
  const showAmbush = p.spotIdx >= 0 || (p.me != null && stance! >= 2 && stance! <= 3);
  const doSplit = () => {
    let mask = 0;
    for (const i of checked) mask |= 1 << i;
    if (mask) p.onSplit(mask);
  };
  return (
    <>
      <div className="cmp-title"><UiIcon name="flag" /><b>Army {p.armyId}</b></div>
      <div className="cmp-roster">
        {p.roster.map((r, i) => (r.count > 0 ? (
          <div key={i}><label><input type="checkbox" data-entry={i} checked={checked.has(i)} onChange={() => toggle(i)} /> {prettyClass(r.class)}: {r.count}/{r.max} (morale {Math.round(r.morale_cap * 100)}%)</label></div>
        ) : null))}
      </div>
      <div style={{ marginTop: 6 }}>
        <label><input type="checkbox" id="cmp-auto-replenish" checked={p.autoReplenish} onChange={(e) => p.onAutoReplenish(e.target.checked)} /> <UiIcon name="replenish" /> Auto replenish</label><br />
        <button id="cmp-halt" onClick={p.onHalt}><UiIcon name="stop" /> Halt</button>
        <button id="cmp-camp" onClick={p.onCamp}><UiIcon name="shield" /> {stance === 1 ? 'Fortified' : 'Fortify'}</button>
        {showAmbush ? <button id="cmp-ambush" disabled={stance! >= 2} onClick={p.onAmbush}>{ambushLabel}</button> : null}
        <button id="cmp-split" onClick={doSplit}><UiIcon name="split" /> Split</button>
        {p.buddy ? <button id="cmp-merge" onClick={p.onMerge}><UiIcon name="split" /> Merge {p.buddy.id}</button> : null}
      </div>
    </>
  );
}
