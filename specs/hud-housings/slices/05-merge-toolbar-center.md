# 05 — Merge toolbar into the center card housing

## Contract unlocked
The order/time toolbar becomes a **control strip inside the center card's
housing**, below the card wells (per the reference) — the standalone `#toolbar`
pill is gone. The two center blocks become one card.

## Slice variable & crop
**One visual variable: the toolbar's container** (separate pill → strip inside the
center housing).
- **Judge:** the center-card crop — wells on top, control strip below, one
  continuous bronze housing.
- **Out of scope:** custom tooltips (08), final gap-centering (07).

## API seam
- `<CenterCard>` renders one `<Chassis variant="tray">` containing
  `[ UnitCardsView (memo'd), <divider/well>, Toolbar ]`. `Toolbar.tsx` is
  unchanged (same `LAYOUT`, commands, ≤5 Hz sig-diff render via `handle.setToolbar`).
- Remove the `#toolbar` inline positioning CSS; delete the separate container.
- Keep the grid mechanics (`--cols/--card-w/--card-h`, `window.__cardGrid`); the
  strip adds fixed height below the wells — account for it in the housing padding
  and the `maxRows`/height budget so the center does not eat too much battlefield.

## Firewall (the load-bearing check for this slice)
The toolbar's ≤5 Hz re-renders now live in the **same subtree** as the card grid.
They must **not** reconcile the card DOM: `Toolbar` is a sibling of the
`React.memo`'d `UnitCardsView`, and the rAF loop's ref writes target nodes a
`Toolbar` re-render never touches. **Prove it:** `?measurecards`
(`window.__cardUpdateSamples`) self-time stays Δ≈0 after the merge. If it
regresses, the memo boundary is wrong — fix before accepting.

## What the human can run / see
`bun run --cwd web scene -- battle-selection` — cards and controls in one bronze
housing, bottom-center; toolbar clicks still issue the right commands.

## Verification
- `?measurecards` Δ≈0 (per-frame card paint unaffected).
- Toolbar command behavior green (pace/reform/pursue/fire/kite, pause/x1/x3, paths).
- Re-bless `battle-selection-dpr2` (reviewed, headful).
- **compare-screenshots** the center crop vs the reference (control strip inside
  the same housing); **screenshot-critique** as the last check.
- Human checkpoint (**non-blocking**) via `preview-shots`, ~5 min, decide-and-record.
- The lab `card-bar.mjs` drives the bare grid (no toolbar) — decide explicitly:
  keep it measuring grid math (unchanged) and rely on the live scene for the merged
  housing, or extend the lab. Record the decision here.

## Stays green
The 60 Hz firewall, `updateToolbar` sig-diff, `window.__cardGrid`, the lab path.

## Feedback that would change this slice
Strip layout (single row vs the current sep-grouped clusters, order-vs-time
grouping) is a checkpoint call; the housing merge stands regardless.
