# Slice 6 — Minimum-window gate + "window too small" placeholder

_Requested by David (2026-06-30): "the game has a min width it needs … can we make
the game render a placeholder if the window size is not big enough?"_

## Why

The card bar is fixed-size and wraps into rows, and it **reserves the bottom-right
minimap zone** (`MINIMAP_RESERVE = 210` each side) so a wide bar never collides
with the minimap. That keeps the layout correct at any width — but on a **narrow**
window the bar wraps to `maxRows` and then shrinks cards (degenerate), and the
battlefield/HUD get cramped. Rather than degrade silently, declare a **minimum
supported window size** and show a clean placeholder below it, telling the player
to enlarge the window.

## The width math (the answer to "what width?")

A centered bar of width `B` clears the minimap when `B ≤ innerWidth − 2×210`. At
the fixed `cardW = 72` (+`gap 4`), one row holds `floor((innerWidth − 420 + 4)/76)`
cards. To hold a roster of `N` cards at the fixed size in `≤ maxRows (3)` rows
clear of the minimap:

```
innerWidth ≥ ceil(N / 3) × 76 + 420
```

| roster N | cards/row (3 rows) | min innerWidth |
|---------:|-------------------:|---------------:|
| 20       | 7                  | ~952px         |
| 30       | 10                 | ~1180px        |
| 40       | 14                 | ~1484px        |

So **a single row of 20 cards beside the minimap needs ~1960px** (`20×76 + 420`) —
but the bar *wraps*, so it never needs that: 20 fits in 2 rows at 1280px. The real
floor is whatever roster size we want to render at fixed size without shrinking.

**Recommended `MIN_WINDOW_W = 1180`** (holds 30 unit cards at fixed size clear of
the minimap; comfortably above the 952px a 20-card army needs) and
`MIN_WINDOW_H = 640` (room for a 3-row bar above the toolbar plus battlefield).
Both are tunable constants pinned by David. Armies larger than 30 still render —
their cards shrink past capacity — the gate is about a *usable* floor, not
correctness.

## API seam

- A single hidden overlay `#viewport-too-small` in `web/index.html` (full-screen,
  high z-index, a short message + the min size — David's "placeholder img" can be a
  styled panel or an `<img>`), shown/hidden by one predicate
  `window.innerWidth < MIN_WINDOW_W || window.innerHeight < MIN_WINDOW_H`.
- Battle-scoped: the `BattleScene` toggles it on `resize` and on entry, and the
  toggle is registered in its `cleanups` so it never lingers into the menu /
  campaign. (Keep the predicate in one small exported helper so the lab card-bar
  route can reuse it for the scene gate without booting the real battle.)
- No sim/wasm involvement; pure DOM + a resize listener.

## Verification

- Extend `web/scenes/ui/card-bar.mjs` (or a sibling `card-bar-too-small.mjs`):
  load the route at a sub-minimum viewport (e.g. 900×600), assert
  `#viewport-too-small` is visible and the card grid is hidden/covered; at
  1280×800 assert it is hidden. One `snapCheck` of the placeholder.
- **compare-screenshots** + **screenshot-critique** as for every visual slice.

## Must stay green

- The card-bar scene's 20/30/40 cases (run at 1280×800, above the floor) — the
  gate stays hidden there.
- `battle-selection` / `battle-renderer-visual` (run at ≥1280) — gate hidden, HUD
  unchanged.

## Human review checkpoint

David confirms the `MIN_WINDOW_W/H` values at the real battle camera and that the
placeholder copy/art reads right.
