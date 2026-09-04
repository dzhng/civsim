import { CAMPAIGN_SPEED_LABELS } from "../../campaign/speeds";
import { uiIcon } from "../../campaign/icons";
import { Tooltip } from "../hud/Tooltip";

export interface CampaignTopBarState {
  dateText: string;
  goldText: string;
  paused: boolean;
  speed: number;
  factionView: boolean;
  fog: boolean;
  diploOpen: boolean;
  classesOpen: boolean;
}

export interface CampaignTopBarActions {
  pause(): void;
  speed(index: number): void;
  factions(): void;
  fog(): void;
  diplomacy(): void;
  classes(): void;
  save(): void;
  exit(): void;
}

export interface CampaignTopBarProps {
  state: CampaignTopBarState;
  on: CampaignTopBarActions;
}

const html = (s: string) => ({ __html: s });

export function CampaignTopBar(p: CampaignTopBarProps) {
  const { state, on } = p;
  return (
    <div className="cmp-top hud-chassis hud-chassis--tray">
      <span id="cmp-date" className="cmp-readout">
        {state.dateText}
      </span>
      <span id="cmp-gold" className="cmp-readout">
        {state.goldText}
      </span>
      <Tooltip label="Pause">
        <button
          id="cmp-pause"
          className="cmp-tool"
          aria-label="Pause"
          onClick={on.pause}
          dangerouslySetInnerHTML={html(uiIcon("pause"))}
        />
      </Tooltip>
      {CAMPAIGN_SPEED_LABELS.map((label, i) => (
        <button
          key={i}
          data-speed={i}
          className={!state.paused && state.speed === i ? "on" : ""}
          onClick={() => on.speed(i)}
        >
          {label}
        </button>
      ))}
      <button
        id="cmp-factions"
        aria-label="Toggle faction view"
        className={state.factionView ? "on" : ""}
        onClick={on.factions}
        dangerouslySetInnerHTML={html(uiIcon("map") + " Factions")}
      />
      <button
        id="cmp-fog"
        aria-label="Toggle fog of war"
        className={state.fog ? "on" : ""}
        onClick={on.fog}
        dangerouslySetInnerHTML={html(uiIcon("cloudFog") + " Fog")}
      />
      <button
        id="cmp-diplo-btn"
        className={state.diploOpen ? "on" : ""}
        onClick={on.diplomacy}
        dangerouslySetInnerHTML={html(uiIcon("flag") + " Diplomacy")}
      />
      <button
        id="cmp-classes-btn"
        className={state.classesOpen ? "on" : ""}
        onClick={on.classes}
        dangerouslySetInnerHTML={html(uiIcon("shield") + " Classes")}
      />
      <span style={{ flex: 1 }} />
      <Tooltip label="Save campaign">
        <button
          id="cmp-save"
          className="cmp-tool"
          aria-label="Save campaign"
          onClick={on.save}
          dangerouslySetInnerHTML={html(uiIcon("save"))}
        />
      </Tooltip>
      <Tooltip label="Menu">
        <button
          id="cmp-exit"
          className="cmp-tool"
          aria-label="Menu"
          onClick={on.exit}
          dangerouslySetInnerHTML={html(uiIcon("door"))}
        />
      </Tooltip>
    </div>
  );
}
