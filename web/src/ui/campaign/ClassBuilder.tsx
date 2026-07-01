import { classSort, prettyClass, type ClassDoctrineRow } from '../../campaign/panels';
import { UiIcon } from './UiIcon';

// S5d: the class-builder panel (#cmp-classes) as React — ported 1:1 from
// classBuilderHtml/classRow. Draft state (pending unit/size before Apply) lives
// on CampaignScene; this component is data-in (rows already carry the draft
// overlay + dirty flag) / action-out.
export interface ClassBuilderProps {
  rows: ClassDoctrineRow[];
  onSelectUnit(cls: number, unit: number): void;
  onSelectSize(cls: number, size: number): void;
  onApply(cls: number): void;
}

export function ClassBuilder({ rows, onSelectUnit, onSelectSize, onApply }: ClassBuilderProps) {
  const sorted = [...rows].sort((a, b) => classSort(a.class) - classSort(b.class));
  return (
    <>
      <div className="cmp-title"><UiIcon name="shield" /><b>Class Builder</b></div>
      {sorted.map((row) => {
        const selectedName = row.options.find((o) => o.id === row.selected)?.name ?? 'Unknown';
        return (
          <div className="cmp-class-row" key={row.classIndex}>
            <div>
              <div className="cmp-class-name">{prettyClass(row.class)}</div>
              <div className="cmp-class-meta">{row.live.toLocaleString()}/{row.max.toLocaleString()} · {selectedName}{row.cooldown > 0 ? ` · ${Math.ceil(row.cooldown / 1440)}d` : ''}</div>
              <div className="cmp-size">
                {[1, 2, 3].map((s) => (
                  <button key={s} data-class={row.classIndex} data-size={s} className={s === row.sizeMult ? 'on' : undefined} onClick={() => onSelectSize(row.classIndex, s)}>{s}x</button>
                ))}
              </div>
              {row.dirty ? <button data-apply={row.classIndex} onClick={() => onApply(row.classIndex)}><UiIcon name="check" /> Apply</button> : null}
            </div>
            <div className="cmp-unit-options">
              {row.options.map((o) => {
                const sel = o.id === row.selected;
                const disabled = !o.unlocked || row.cooldown > 0;
                const cost = o.applyCost == null ? 'cooldown' : `${o.applyCost.toLocaleString()}g`;
                return (
                  <div className={'cmp-unit ' + (sel ? 'sel' : '')} key={o.id}>
                    <div><b>{o.name}</b><br /><small>{o.costPerSoldier.toFixed(2)}g recruit · {o.upkeepPerSoldier.toFixed(3)}g upkeep/day</small></div>
                    <button data-class={row.classIndex} data-unit={o.id} disabled={disabled || sel} onClick={() => onSelectUnit(row.classIndex, o.id)}>{sel ? <><UiIcon name="check" /> Selected</> : cost}</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
