# Slice 4 — Swap card portrait `<canvas>` → `<img>` (baked model shot)

## Contract unlocked

Each card shows the **baked 3D-model portrait** from S3 instead of the flat
stick-figure; the live HP / cohesion / morale bars, count, selection, and rout
state are **unchanged**. A missing PNG falls back to the old canvas so the bar
never blanks. This is the slice where the feature visibly becomes "Total War."

## API seam

- **`web/src/battle/unitCard.ts` (`UnitCards.build`)** — replace the
  `<canvas class="ucard-port">` + `drawPortrait()` call with:

  ```ts
  const port = document.createElement('img');
  port.className = 'ucard-port';
  port.loading = 'eager'; port.decoding = 'async';
  port.alt = u.name;
  port.src = cardThumbUrl(u.look ?? modelLookForClass(u.cls));   // S3 helper
  port.onerror = () => { /* fall back to the canvas drawPortrait for this look */ };
  ```

  Keep `drawPortrait` (and `W`/`H`) **only** as the `onerror` fallback until every
  look is confirmed baked; once all are present and reviewed, S5 may retire it.
  `update()` stays verbatim (bars-only). The card's `--fac` faction accent stays.
- **CSS (both copies):** `.ucard-port { width:100%; height:auto; aspect-ratio:3/4;
  object-fit:contain; display:block; }` — replaces the canvas sizing. Keep the
  subtle background gradient behind it.

## What a human can run / see

- Real `?battle=5v5` and the `/renderer/card-bar?count=20|30|40` harness now show
  rendered model portraits with live bars.
- `?battle=5v5&ai=on` — watch an HP bar drop while the portrait stays put (proves
  the kept `update()` path survived the `build()` change).

## Verification

- **Re-bless** `web/scenes/ui/card-bar.mjs` (now img portraits) and
  `battle-selection` baselines. Every card scene must wait for decode before
  snapping: `await page.waitForFunction(() => [...document.images].every(i =>
  i.complete && i.naturalWidth > 0))` (and/or `img.decode()`), or the snapshots
  flake on decode timing.
- Assert in the scene that each `.ucard-port` is an `<img>` with a non-empty
  `currentSrc` and `naturalWidth > 0` (the baked PNG actually loaded, not the
  fallback) for at least the looks present in the roster.
- Assert a bar `style.width` still changes after advancing the sim a few ticks
  (live path intact).
- **compare-screenshots (required):** run
  [compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md) on
  the integrated 20-card bar vs `specs/card-bar/assets/reference-tw-cardbar.png`
  (whole-strip A/B) — the now-or-never fidelity check with portraits, bars, and
  count all present: density, aspect, portrait read, bar placement, overall
  Total-War polish. Note any gap against the reference for David's sign-off.
- **screenshot-critique (required, last step):** run
  [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) on
  the integrated 20-card and 5v5 captures with an unprimed sub-agent — do the
  portraits read as the right class at card size, do bars/count sit cleanly over
  them, does the whole bar match the reference's density and polish? This is the
  final taste gate before the feature is "done."

## Must stay green

- Slice 1 (`cardGrid.test.mjs`), Slice 2 layout (no-scroll, geometry probe),
  Slice 3 (`bake:cards --check`, montage).
- `battle-selection` (re-blessed once), lab `routeBattleUi`/`routeBattleLive`
  (re-blessed once). Each re-bless is a reviewed diff, not a blind update.

## Human review checkpoint

David confirms: portraits read as the right class at all of 5 / 20 / 30 / 40;
bars and count remain legible over them; the bar holds up beside
`assets/reference-tw-cardbar.png`; and live state still animates in a running
battle. Sign-off here = the core feature is shipped (S5 is optional cleanup).

## Feedback that would change this slice

- "Portrait fights the bars for space" → adjust the card's internal layout
  (portrait box vs bars row) within the fixed 3:4.
- "Some cards show the fallback stick-figure" → a look is unbaked; back to S3.
- "Want a faction tint on the portrait itself, not just the border" → trigger the
  deferred team-variant bake (S3 follow-up).
