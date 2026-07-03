import { uiIcon } from "../../campaign/icons";
import { Tooltip } from "../hud/Tooltip";

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
    <div className="cmp-top hud-chassis hud-chassis--tray">
      <span id="cmp-date" className="cmp-readout">
        {p.dateText}
      </span>
      <span id="cmp-gold" className="cmp-readout">
        {p.goldText}
      </span>
      <Tooltip label="Pause">
        <button
          id="cmp-pause"
          className="cmp-tool"
          aria-label="Pause"
          onClick={p.onPause}
          dangerouslySetInnerHTML={html(uiIcon("pause"))}
        />
      </Tooltip>
      {["1x", "3x", "10x"].map((label, i) => (
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
        aria-label="Toggle faction view"
        className={p.factionView ? "on" : ""}
        onClick={p.onFactions}
        dangerouslySetInnerHTML={html(uiIcon("map") + " Factions")}
      />
      <button
        id="cmp-fog"
        aria-label="Toggle fog of war"
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
      <Tooltip label="Save campaign">
        <button
          id="cmp-save"
          className="cmp-tool"
          aria-label="Save campaign"
          onClick={p.onSave}
          dangerouslySetInnerHTML={html(uiIcon("save"))}
        />
      </Tooltip>
      <Tooltip label="Menu">
        <button
          id="cmp-exit"
          className="cmp-tool"
          aria-label="Menu"
          onClick={p.onExit}
          dangerouslySetInnerHTML={html(uiIcon("door"))}
        />
      </Tooltip>
    </div>
  );
}
