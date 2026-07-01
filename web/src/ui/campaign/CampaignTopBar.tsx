import { uiIcon } from "../../campaign/icons";

// S5a: the campaign top bar (.cmp-top) as React — the foundational, lowest-risk
// piece of the campaign migration. Renders byte-identical DOM (same ids/classes,
// same icon SVGs via dangerouslySetInnerHTML) so the slate `#campaign-ui` CSS in
// panels.ts still styles it and the campaign visual baselines stay identical.
// The other panels stay vanilla for now; the CampaignScene bridges ≤5Hz state
// (date/gold/speed/paused/view toggles) in and dispatches actions back out.

export interface CampaignTopBarProps {
  dateText: string;
  goldText: string;
  paused: boolean;
  speed: number;
  factionView: boolean;
  fog: boolean;
  diploOpen: boolean;
  classesOpen: boolean;
  onPause(): void;
  onSpeed(i: number): void;
  onFactions(): void;
  onFog(): void;
  onDiplomacy(): void;
  onClasses(): void;
  onSave(): void;
  onExit(): void;
}

const html = (s: string) => ({ __html: s });

export function CampaignTopBar(p: CampaignTopBarProps) {
  return (
    <div className="cmp-top">
      <span id="cmp-date">{p.dateText}</span>
      <span id="cmp-gold">{p.goldText}</span>
      <button
        id="cmp-pause"
        title="Pause"
        onClick={p.onPause}
        dangerouslySetInnerHTML={html(uiIcon("pause"))}
      />
      {["1×", "3×", "10×"].map((label, i) => (
        <button
          key={i}
          data-speed={i}
          className={!p.paused && p.speed === i ? "on" : ""}
          onClick={() => p.onSpeed(i)}
        >
          {label}
        </button>
      ))}
      <button
        id="cmp-factions"
        title="Toggle faction (political) view — V"
        className={p.factionView ? "on" : ""}
        onClick={p.onFactions}
        dangerouslySetInnerHTML={html(uiIcon("map") + " Factions")}
      />
      <button
        id="cmp-fog"
        title="Toggle fog of war — F"
        className={p.fog ? "on" : ""}
        onClick={p.onFog}
        dangerouslySetInnerHTML={html(uiIcon("cloudFog") + " Fog")}
      />
      <button
        id="cmp-diplo-btn"
        className={p.diploOpen ? "on" : ""}
        onClick={p.onDiplomacy}
        dangerouslySetInnerHTML={html(uiIcon("flag") + " Diplomacy")}
      />
      <button
        id="cmp-classes-btn"
        className={p.classesOpen ? "on" : ""}
        onClick={p.onClasses}
        dangerouslySetInnerHTML={html(uiIcon("shield") + " Classes")}
      />
      <span style={{ flex: 1 }} />
      <button
        id="cmp-save"
        onClick={p.onSave}
        dangerouslySetInnerHTML={html(uiIcon("save") + " Save")}
      />
      <button
        id="cmp-exit"
        onClick={p.onExit}
        dangerouslySetInnerHTML={html(uiIcon("door") + " Menu")}
      />
    </div>
  );
}
