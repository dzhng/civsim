import { useEffect, useRef, useState } from 'react';
import type { BattleKind } from '../../battle/scene';
import type { GpuSupportState } from '../../../../packages/game-renderer/src/appShell';

/** Everything the React menu needs from MenuScene. The cfg-shaped callbacks are
 * passed straight through; gpu state + class list + save presence are snapshot
 * values read at render time (the menu only re-renders on its own modal state,
 * never per frame). */
export interface MenuProps {
  gpuStatus: GpuSupportState;
  classNames: readonly string[];
  /** Index of the unit class the duel pre-selects for side B (a lively foe). */
  duelDefaultB: number;
  hasSave: boolean;
  onQuickBattle: (kind: BattleKind) => void;
  /** Opens the still-vanilla custom-battle army builder. */
  onOpenCustomBattle: () => void;
  onDuel: (a: number, b: number, ai: boolean) => void;
  onNewCampaign: () => void;
  onLoadCampaign: () => void;
  /** Toggles the vanilla #manual overlay (owned outside React). */
  onToggleManual: () => void;
  /** Hides the vanilla #manual overlay (for the Escape handler). */
  onHideManual: () => void;
}

/** Boot menu, ported 1:1 from the old #menu-ui markup so the bronze styling in
 * index.html still applies and the screenshot baselines stay pixel-identical.
 * The custom-battle army builder stays vanilla (S2); this only renders its
 * trigger. pointer-events:auto re-enables clicks inside the click-through
 * #ui-root overlay. */
export function Menu(props: MenuProps) {
  const { gpuStatus, classNames, hasSave } = props;
  const ok = gpuStatus.ok;
  const msg = gpuStatus.message;

  const [duelOpen, setDuelOpen] = useState(false);
  const [duelA, setDuelA] = useState(0);
  const [duelB, setDuelB] = useState(props.duelDefaultB);
  const [duelAi, setDuelAi] = useState(false);
  const duelARef = useRef<HTMLSelectElement>(null);

  // Match the old scene: opening the duel focuses side A (so the snapshot keeps
  // its focus ring, and keyboard users land on the picker).
  useEffect(() => {
    if (duelOpen) duelARef.current?.focus();
  }, [duelOpen]);

  // Escape closes the duel modal and the field manual, matching the old scene.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDuelOpen(false);
      props.onHideManual();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  const disabledTitle = ok ? '' : msg;
  const options = classNames.map((name, i) => (
    <option key={i} value={String(i)}>{name}</option>
  ));

  return (
    <div id="menu-ui" style={{ display: 'flex', pointerEvents: 'auto' }}>
      <h1>BATTLE SIM</h1>
      <p className="tagline">mass &middot; momentum &middot; morale</p>
      <div
        id="menu-renderer-status"
        role="status"
        className={ok ? 'ok' : 'bad'}
      >
        {ok ? msg : `WebGPU unavailable: ${msg}`}
      </div>

      <div className="menu-section feature">
        <h2>Campaign</h2>
        <p className="section-hint">Six powers, real-time. Wage war, forge alliances, gang up on the strong.</p>
        <button id="menu-new-campaign" disabled={!ok} title={disabledTitle} onClick={props.onNewCampaign}>
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
        <button id="menu-1v1" disabled={!ok} title={disabledTitle} onClick={() => ok && setDuelOpen(true)}>
          1v1 Duel <small>you pick the matchup</small>
        </button>
        <button data-battle="5v5" disabled={!ok} title={disabledTitle} onClick={() => props.onQuickBattle('5v5')}>
          Clash of Arms <small>full roster, open field</small>
        </button>
        <button id="menu-quick-battle" disabled={!ok} title={disabledTitle} onClick={() => ok && props.onOpenCustomBattle()}>
          Custom Battle <small>pick a map, build two armies</small>
        </button>
      </div>

      <div className="menu-section">
        <button id="menu-manual" onClick={props.onToggleManual}>Field Manual</button>
      </div>

      <div
        id="duel-modal"
        style={{ display: duelOpen ? 'flex' : 'none' }}
        onClick={(e) => { if (e.target === e.currentTarget) setDuelOpen(false); }}
      >
        <div className="panel">
          <h2>1v1 DUEL</h2>
          <div className="duel-row">
            <select id="duel-a" ref={duelARef} value={String(duelA)} onChange={(e) => setDuelA(Number(e.target.value))}>{options}</select>
            <span className="duel-vs">vs</span>
            <select id="duel-b" value={String(duelB)} onChange={(e) => setDuelB(Number(e.target.value))}>{options}</select>
          </div>
          <label className="duel-ai">
            <input type="checkbox" id="duel-ai" checked={duelAi} onChange={(e) => setDuelAi(e.target.checked)} /> enemy AI commander
          </label>
          <button id="menu-duel" onClick={() => { setDuelOpen(false); props.onDuel(duelA, duelB, duelAi); }}>Fight</button>
          <button className="cancel" id="duel-cancel" onClick={() => setDuelOpen(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
