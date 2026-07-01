# 07 — Asymmetric reserve + flush-corner placement (load-bearing)

**The one non-obvious math slice. Both flanking cards now exist (03, 06), so the
center's horizontal budget can be reconciled properly.**

## Contract unlocked
The center card reserves space for the **left and right housings
independently** and floats **centered in the gap between them** — no longer a
symmetric magic margin, no longer screen-centered. The interim reserve bump from
slice 03 is replaced by the real budget.

## API seam
- `unitCard.ts`: `applyCardGrid(root, count, sideReserve)` →
  `applyCardGrid(root, count, leftReserve, rightReserve)`;
  `boxW = window.innerWidth − leftReserve − rightReserve`. Replace the single
  `MINIMAP_RESERVE = 210` with two design constants
  `LEFT_CARD_RESERVE` / `RIGHT_CARD_RESERVE`, **measured from the fixed-width
  corner housings** (no longer guessed).
- CSS: `#unitcards` / `<CenterCard>` drops `left:50%; translateX(-50%)` →
  positioned within `[leftReserve, innerWidth − rightReserve]` with inner
  `justify-content: center` (shrink-wrap centered in the gap — the recommended
  shape; see the known-unknown below).
- Update **both** `applyCardGrid` call sites (game `UnitCardsReact.tsx` +
  lab/`uiLayer.ts`) — add a compat default for the lab if it only needs one
  reserve.
- Update `viewportGate.ts` `MIN_WINDOW_W` (currently `2×MINIMAP_RESERVE`) to the
  new `leftReserve + rightReserve + minCenterWidth` formula, and its comment.
- **Firewall:** grid recompute stays roster-change + resize only — **never
  per-frame, never per-selection.** The corner housings are fixed width, so
  selecting a unit must not reflow the center.

## What the human can run / see
The center bar sits in the gap between the two corner cards and stays centered
there; shrinking the window trips the too-small gate at the new floor.

## Verification
- **Headless `cardGrid.test.mjs` extended** with asymmetric cases (unequal
  left/right reserves → correct `cols`/`card-w`) — this pure-math gate carries the
  correctness.
- `card-bar.mjs` (lab, headless) green — extend the lab route to pass asymmetric
  reserves and assert `window.__cardGrid`.
- Re-bless `battle-selection-dpr2` (reviewed, headful).
- Verify `#viewport-too-small` still trips correctly at the new `MIN_WINDOW`.
- **screenshot-critique** on the composed three-housing frame.
- **Human checkpoint here is the real one** (still non-blocking): pin the
  fixed corner-card widths and the center shape (shrink-wrap-in-gap vs gap-filling)
  — open the shot with `preview-shots`, ~5 min, decide on the evidence, record the
  chosen constants and rationale here.

## Stays green
The 60 Hz firewall, the no-scroll / fixed-card invariant, both card-grid callers.

## Feedback that would change this slice
If David wants the center as a **continuous gap-filling bar** rather than
shrink-wrapped, `computeCardGrid` grows the cards/columns to fill `boxW` instead of
wrapping at fixed `CARD_W` — a `computeCardGrid` option, not a rewrite. Decide at
the checkpoint before committing the constants.
