// Minimum supported battle-window size. Below it the HUD (the fixed-size card bar
// beside the bottom-right minimap, the toolbar, the battlefield) gets cramped, so
// the battle shows a "window too small" placeholder instead of degrading silently.
//
// The floor follows from the card bar's geometry: a centered bar clears the
// minimap when it is no wider than `viewport − 2×MINIMAP_RESERVE`, and at the
// fixed 72px card it holds `ceil(N/maxRows)` cards per row — so a roster of N
// fits at full size when `viewport ≥ ceil(N/3)×76 + 420`. 1180px holds 30 unit
// cards; 640px leaves room for a 3-row bar above the toolbar. Tunable by David.
export const MIN_WINDOW_W = 1180;
export const MIN_WINDOW_H = 640;

export function windowTooSmall(): boolean {
  return window.innerWidth < MIN_WINDOW_W || window.innerHeight < MIN_WINDOW_H;
}

/** Show `overlay` whenever the window is below the supported minimum, and keep it
 * in sync on resize. Returns a cleanup that drops the listener and hides it. */
export function installViewportGate(overlay: HTMLElement): () => void {
  const apply = () => { overlay.style.display = windowTooSmall() ? 'flex' : 'none'; };
  apply();
  window.addEventListener('resize', apply);
  return () => {
    window.removeEventListener('resize', apply);
    overlay.style.display = 'none';
  };
}
