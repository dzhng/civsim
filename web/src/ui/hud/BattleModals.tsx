// S6e: the battle decision overlays as React. Each renders the .panel content
// into its existing #gameover / #pausemenu shell (which keeps the CSS backdrop,
// z-index, and display toggle). Ported 1:1 from the index.html markup.

export interface GameOverProps {
  inCampaign?: boolean;
  win: boolean;
  sub: string;
  onRestart(): void;
  onExit(): void;
  onWatch(): void;
}

export function GameOver({ inCampaign, win, sub, onRestart, onExit, onWatch }: GameOverProps) {
  return (
    <div className="panel">
      <h2 id="gameover-title" style={{ color: win ? '#6f9ae8' : '#e0604f' }}>{win ? 'VICTORY' : 'DEFEAT'}</h2>
      <p id="gameover-sub">{sub}</p>
      {!inCampaign ? <button id="gameover-restart" onClick={onRestart}>Restart Battle</button> : null}
      <button id="gameover-menu" onClick={onExit}>{inCampaign ? 'Continue' : 'Main Menu'}</button>
      <button className="watch" id="gameover-watch" onClick={onWatch}>keep watching the field</button>
    </div>
  );
}

export interface PauseMenuProps {
  inCampaign?: boolean;
  onRestart(): void;
  onManual(): void;
  onExit(): void;
  onClose(): void;
}

export function PauseMenu({ inCampaign, onRestart, onManual, onExit, onClose }: PauseMenuProps) {
  return (
    <div className="panel">
      <h2>MENU</h2>
      {!inCampaign ? <button id="pause-restart" onClick={onRestart}>Restart Battle</button> : null}
      <button id="pause-manual" onClick={onManual}>Field Manual</button>
      <button id="pause-exit" onClick={onExit}>{inCampaign ? 'Exit to Campaign' : 'Exit to Main Menu'}</button>
      <button className="watch" id="pause-close" onClick={onClose}>back to the field</button>
    </div>
  );
}
