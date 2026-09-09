import { useEffect, useState } from "react";
import type { GpuSupportState } from "@packages/game-renderer/src/appShell";
import type { QuickBattleClassSpec, QuickBattleConfig } from "../../battle/quickBattleCatalog";
import { GraphicsSettingsModal } from "../graphics/GraphicsSettingsModal";
import { ArmyBuilder } from "./ArmyBuilder";

/** Everything the React menu needs from MenuScene. The cfg-shaped callbacks are
 * passed straight through; gpu state + class list + save presence are snapshot
 * values read at render time (the menu only re-renders on its own modal state,
 * never per frame). */
export interface MenuProps {
  gpuStatus: GpuSupportState;
  battleSetup: boolean;
  initialConfig?: QuickBattleConfig;
  setupError?: string;
  onOpenBattle: () => void;
  onCloseBattle: () => void;
  hasSave: boolean;
  /** Class rows for the custom-battle army builder (now React). */
  classes: QuickBattleClassSpec[];
  /** Launch a configured custom battle. */
  onCustomBattle: (cfg: QuickBattleConfig) => void;
  onNewCampaign: () => void;
  onLoadCampaign: () => void;
  /** Toggles the vanilla #manual overlay (owned outside React). */
  onToggleManual: () => void;
  /** Hides the vanilla #manual overlay (for the Escape handler). */
  onHideManual: () => void;
}

/** Boot menu using the legacy #menu-ui structure so the bronze styling in
 * index.html still applies. Custom Battle is the one player-facing battle
 * entry; pointer-events:auto re-enables clicks inside the click-through
 * #ui-root overlay. */
export function Menu(props: MenuProps) {
  const { gpuStatus, hasSave } = props;
  const ok = gpuStatus.ok;
  const msg = gpuStatus.message;

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Escape closes the custom battle modal and the field manual.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (props.battleSetup) props.onCloseBattle();
      setSettingsOpen(false);
      props.onHideManual();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const disabledTitle = ok ? "" : msg;

  return (
    <>
      <div id="menu-ui" style={{ display: "flex", pointerEvents: "auto" }}>
        <h1>BATTLE SIM</h1>
        <p className="tagline">mass &middot; momentum &middot; morale</p>
        <div id="menu-renderer-status" role="status" className={ok ? "ok" : "bad"}>
          {ok ? msg : `WebGPU unavailable: ${msg}`}
        </div>

        <div className="menu-section feature">
          <h2>Campaign</h2>
          <p className="section-hint">
            Six powers, real-time. Wage war, forge alliances, gang up on the strong.
          </p>
          <button
            id="menu-new-campaign"
            disabled={!ok}
            title={disabledTitle}
            onClick={props.onNewCampaign}
          >
            New Campaign <small>conquer the ancient world</small>
          </button>
          <button
            id="menu-load-save"
            disabled={!ok || !hasSave}
            title={disabledTitle}
            onClick={props.onLoadCampaign}
          >
            Load Save <small>resume your war</small>
          </button>
        </div>

        <div className="menu-section">
          <h2>Quick Battle</h2>
          <button
            id="menu-quick-battle"
            disabled={!ok}
            title={disabledTitle}
            onClick={() => ok && props.onOpenBattle()}
          >
            Custom Battle <small>pick a map, build two armies</small>
          </button>
        </div>

        <div className="menu-section">
          <button id="menu-settings" onClick={() => setSettingsOpen(true)}>
            Settings <small>graphics</small>
          </button>
          <button id="menu-manual" onClick={props.onToggleManual}>
            Field Manual
          </button>
        </div>
      </div>

      {/* Sibling of #menu-ui (not a child) — the custom-battle modal must stay
          OUTSIDE #menu-ui so the `#menu-ui button` rule doesn't bloat the army
          builder's .qb-step/.qb-template buttons, exactly as when it was a
          body-level element. */}
      {props.setupError && (
        <p role="alert" className="battle-setup-error">
          {props.setupError}
        </p>
      )}
      <ArmyBuilder
        open={props.battleSetup}
        initialConfig={props.initialConfig}
        classes={props.classes}
        onLaunch={props.onCustomBattle}
        onClose={props.onCloseBattle}
      />
      <GraphicsSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
