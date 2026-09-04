// Minimum supported battle-window size. Below it the three bottom HUD housings
// (bottom-left info card, bottom-center cards+controls, bottom-right minimap) and
// the battlefield get cramped, so the battle shows a "window too small"
// placeholder instead of degrading silently.
//
// The floor follows from the card bar's geometry: the bar
// sits in the gap between the two corner housings, so its width budget is
// `viewport − BOTTOM_CARD_LEFT_RESERVE(336) − BOTTOM_CARD_RIGHT_RESERVE(268)`. At
// the fixed 58px card it wraps to more rows as the roster grows. 1180px leaves
// ~576px of bar (≈9 cards before wrapping); 640px leaves room for a multi-row bar.
export const MIN_WINDOW_W = 1180;
export const MIN_WINDOW_H = 640;

export function windowTooSmall(): boolean {
  return window.innerWidth < MIN_WINDOW_W || window.innerHeight < MIN_WINDOW_H;
}

/** Show `overlay` whenever the window is below the supported minimum, and keep it
 * in sync on resize. Returns a cleanup that drops the listener and hides it. */
export function installViewportGate(overlay: HTMLElement): () => void {
  const apply = () => {
    overlay.style.display = windowTooSmall() ? "flex" : "none";
  };
  apply();
  window.addEventListener("resize", apply);
  return () => {
    window.removeEventListener("resize", apply);
    overlay.style.display = "none";
  };
}
