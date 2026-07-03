import { useRef } from "react";
import { prettyClass, type CityDetail } from "../../campaign/panels";
import { UiIcon } from "./UiIcon";

// Selected-city panel. Flat props keep it independent of CampaignData. Policy
// sliders stay uncontrolled (read both on change, like the vanilla), keyed by
// city so a new selection resets them to that city's values.
const focusLabel = (f: number) => (f < -0.33 ? "Economy" : f > 0.33 ? "Military" : "Balanced");
const throttleLabel = (t: number) => (t > 0.5 ? "Exploit" : "Grow");

export interface CityPanelProps {
  name: string;
  tier: number;
  factionName: string;
  garrison: number;
  queue: number;
  mineCity: boolean;
  detail: CityDetail | null;
  recruitClasses: string[];
  onPolicy(focus: number, throttle: number): void;
  onRecruit(i: number): void;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="cmp-stat">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function BarRow({ label, frac }: { label: string; frac: number }) {
  return (
    <div className="cmp-stat">
      <span>{label}</span>
      <div className="cmp-bar">
        <div style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
      </div>
    </div>
  );
}

export function CityPanel(p: CityPanelProps) {
  const focusRef = useRef<HTMLInputElement>(null);
  const throttleRef = useRef<HTMLInputElement>(null);
  const applyPolicy = () =>
    p.onPolicy(Number(focusRef.current?.value ?? 0), Number(throttleRef.current?.value ?? 0));
  const d = p.detail;
  const pct = d ? Math.round((100 * d.population) / Math.max(1, d.pop_cap)) : 0;
  return (
    <>
      <div className="cmp-title">
        <UiIcon name="city" />
        <b>{p.name}</b>
      </div>
      <StatRow label="Tier" value={`${p.tier} - ${p.factionName}`} />
      <StatRow
        label="Garrison"
        value={`${p.garrison}${p.queue ? ` | recruiting ${p.queue}` : ""}`}
      />
      {d ? (
        <>
          <BarRow label="Pop" frac={d.population / Math.max(1, d.pop_cap)} />
          <BarRow label="Loyalty" frac={d.loyalty} />
          <StatRow label="People" value={`${d.population.toLocaleString()} (${pct}% of cap)`} />
          <StatRow label="Income" value={`${d.monthly_income.toLocaleString()}/mo`} />
        </>
      ) : null}
      {d ? (
        p.mineCity ? (
          <div className="cmp-policy">
            <label>
              Economy ↔ Military
              <input
                ref={focusRef}
                type="range"
                data-policy="focus"
                min="-1"
                max="1"
                step="0.1"
                defaultValue={d.focus}
                onChange={applyPolicy}
              />
            </label>
            <label>
              Grow ↔ Exploit
              <input
                ref={throttleRef}
                type="range"
                data-policy="throttle"
                min="0"
                max="1"
                step="0.1"
                defaultValue={d.throttle}
                onChange={applyPolicy}
              />
            </label>
          </div>
        ) : (
          <div className="cmp-city-meta">
            focus {focusLabel(d.focus)} — {throttleLabel(d.throttle)}
          </div>
        )
      ) : null}
      {p.mineCity ? (
        <div className="cmp-recruits">
          {p.recruitClasses.map((cl, i) => (
            <button key={i} data-recruit={i} title={cl} onClick={() => p.onRecruit(i)}>
              <UiIcon name="add" /> {prettyClass(cl)}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
