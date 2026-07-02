# Battle UI — the whole HUD is a bronze game surface (shipped)

## What shipped

Every battle-sim UI surface reads as a diegetic Total War game HUD, not a web app:
the main menu + setup modals, the top buttons, the unit-info panel, the minimap
housing, and the in-battle modals (game-over, pause, field manual, victory/defeat
banner). They all draw from **one shared bronze design source** so the look can't
drift between the live game and the renderer-lab. The card bar and order toolbar
(`specs/done/card-bar`) were the reference implementations this brought everything
else up to.

## Why it works this way

**One token source, not per-surface copies.** The card bar proved the bronze look
but duplicated its CSS (the live `index.html` and the lab's `installStyles`). That
duplication is the thing this spec killed: the worn-bronze palette, bevel shadows,
and frame live once in `web/src/ui/theme/bronze.css` (`--bronze-*` tokens +
`--well-*`), consumed everywhere via `var()`, so the two shells can't diverge. The
shared-chrome extraction was completed by the React migration
(`specs/done/ui-react-migration`), which deleted the lab CSS fork outright.

**Frame the minimap, don't redraw it.** The minimap is a live canvas; this wraps it
in a bronze housing and never touches the canvas render (a hard firewall) — the
same discipline applied to every surface: change chrome, not behavior.

## Principles & invariants (keep these true)

- **The aesthetic contract is a hard gate, not taste.** A surface fails if it shows
  a webapp tell: translucent gradient fades, floating rounded cards/pills with
  gutters, frameless flat panels, slate-grey neutrals, hover-lighten,
  CSS-shadow-as-glow, crisp UI outlines. Targets: opaque worn-bronze housings,
  inset wells, bronze buttons (brass `.on`, dimmed disabled), Phosphor fill icons
  (no emoji), warm materials (bronze/iron/leather/bone — never grey), gold glow for
  selection. This is now codified in the `aesthetics` skill's "UI & HUD — a game
  surface, not a webapp" rule.
- **Bronze values live in ONE source** (`bronze.css`) and are consumed via `var()`;
  never re-inline the palette/bevel into a surface.
- **Firewalls:** the WebGPU passes, terrain, soldier/crowd rendering, the minimap
  canvas *render*, `crates/**`/wasm, the unit-info buffer layout, and the card
  per-frame bar logic are all out of scope — chrome only.

## Pointers into the code

- `web/src/ui/theme/bronze.css` — the token source + the shared `.hud-chassis` /
  `.hud-chassis--tray` housing classes and `.hud-tooltip`.
- Surfaces: `#hud` unit-info panel + `#buttons`/`#btn-menu` + `#minimap` housing +
  `#menu-ui`/`#quick-battle-modal`/`#duel-modal` + `#gameover`/`#pausemenu`/
  `#manual`/`#banner`, styled in `web/index.html`'s inline `<style>` off the tokens.
- React content for the HUD/menu/modals: `web/src/ui/hud/*` (`HudPanel`,
  `BattleModals` → `GameOver`/`PauseMenu`, `Toolbar`, `BattleHud`) and
  `web/src/ui/menu/*` (`Menu`, `ArmyBuilder`).
- Judged against `../card-bar/assets/reference-tw-cardbar.png` (see Visual
  provenance) and the `aesthetics` skill references.

## Divergences (what changed after this spec shipped)

- **The token extraction / de-dup was subsumed by the React migration**
  (`specs/done/ui-react-migration`): tokens landed in `bronze.css`, the card
  bar/toolbar refactored onto `var()`, the lab CSS fork deleted.
- **The whole battle HUD later became one React tree** (`specs/done/hud-housings`),
  which moved the unit-info panel from top-left to the **bottom-left**, the minimap
  to the **bottom-right corner**, merged the cards + toolbar into one housing,
  extracted the `.hud-chassis` classes, and **warmed the bronze palette** (amber-red
  fill, deeper cast bevel). So the surfaces this spec rewrote still read as bronze,
  but their positions/material were re-tuned there.
- **Not done (optional polish tail):** native `<select>` still keeps its OS focus
  ring; the `#menu-renderer-status` notice still reads slightly webapp-ish. Cosmetic,
  non-blocking.

## Visual provenance

- `../card-bar/assets/reference-tw-cardbar.png` (in the sibling `card-bar` spec) —
  the shared **target** for the whole HUD: the Total War Saga: Troy card bar, the
  opaque worn-bronze standard every surface here was measured against. This spec has
  no images of its own; the card bar established the look and this generalized it,
  so the reference is deliberately shared rather than copied.
