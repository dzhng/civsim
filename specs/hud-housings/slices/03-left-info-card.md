# 03 — Left info card → bottom-left corner

## Contract unlocked
The unit stat / info panel leaves the top-left and lives flush in the
**bottom-left corner**; the top-left of the screen becomes empty battlefield.

## Slice variable & crop
**One visual variable: the info housing's position** (`top:12/left:12` → flush
bottom-left corner). Content and chrome are unchanged this slice.
- **Judge:** the bottom-left corner crop — housing anchored to the corner, reads
  as one framed card, does not overlap the center card at the min window.
- **Out of scope (later slices):** the idle roster content (04), the final
  gap-centered placement / asymmetric budget (07), medallion styling (09).

## API seam
- `<LeftInfoCard>` layout in `BattleHud.tsx` / the HUD stylesheet: anchor bottom
  + left instead of top + left.
- **Interim reserve bump (mechanical, not a visual variable):** the left card
  (up to ~282px) is now wider than the symmetric `MINIMAP_RESERVE = 210`, so the
  centered card bar can collide with it. Bump the left clearance the minimum
  needed so the bar clears the left card (temporary; slice 07 replaces this with
  the real asymmetric budget). Keep the change confined to `sideReserve` at the
  call site; do not yet change the `applyCardGrid` signature.

## What the human can run / see
`bun run --cwd web scene -- battle-selection` — stats panel now sits bottom-left;
select a unit and confirm the panel and the center cards never overlap, including
at the `MIN_WINDOW` size.

## Verification
- Re-bless `battle-selection-dpr2` (expected move) — **reviewed diff**, headful.
- Shrink the window toward `MIN_WINDOW` and confirm no left-card / center-card
  collision.
- **compare-screenshots** the bottom-left crop against the reference's left
  housing (`assets/reference-tw-cardbar.png`) — less-wrong verdict on corner
  anchoring, not a pixel match.
- **screenshot-critique** (unprimed) on the new frame as the last check before
  accepting.
- Human checkpoint (**non-blocking**): open the shot with `preview-shots`, allow
  ~5 min; if silent, decide on the evidence, record the decision here, close the
  Preview windows, and proceed.

## Stays green
`cardGrid.test.mjs` (grid math unchanged), the no-scroll card invariant, the lab.

## Feedback that would change this slice
David may want a specific corner inset (fully flush vs a few px gutter) — that is
the checkpoint's purpose; adjust the anchor, not the structure.
