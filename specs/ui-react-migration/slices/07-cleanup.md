# Slice 7 — Cleanup: 4 CSS islands → 1, dedup the lab

## Contract unlocked
The migration's promise lands: **exactly one place** to change the bronze design, **one** card
component, **zero** dead vanilla UI. A future contributor adding a token or a panel has one
obvious home. This is the slice that makes the whole effort net-simpler instead of net-more.

## API seam — deletions, mostly
- **Lab dedup:** `apps/renderer-lab/src/router.ts` `installStyles()` drops its forked
  `.renderer-unitcards .ucard*` + riveted-chassis copy and imports **`web/src/ui/theme/
  bronze.css`** (the lab already imports the real `UnitCards`/`UnitCardsReact` component — only
  the CSS was forked). The `routeCardBar` route now exercises the same component + same CSS as
  the game.
- **Delete** any remaining replaced markup/CSS the S2/S4/S5/S6 branches left behind: stale
  `index.html` UI blocks, `panels.ts` `<style>`, the `campaignDomHtml()` string if fully
  Reactified, `scene.ts` dead HUD construction (if Branch A). Grep `index.html`,
  `web/src/**`, `apps/renderer-lab/**` for the old class names and remove every orphan.
- **Audit:** one `:root`/token definition (in `bronze.css`), one `.chassis`/`.chassis-tray`
  source, one card component. No `export *` barrel, no compat shim, no dead flag from S3
  (`?hud=react` removed once S6 picked a default).

## What a human can run / see
The game and `/renderer/card-bar` render from the **same** component + CSS; changing a bronze
token in `bronze.css` moves both. Nothing visual changes for the player.

## Verification
- **Pure-refactor gate: pixel-identity.** The full suite — `card-bar` family,
  `battle-renderer-visual` (`battle-selection-dpr2`), `menu-renderer-shell-visual`,
  `menu-modals`, the campaign scenes — at **{0,0} / no re-bless**. A forced re-bless here means
  a deletion changed rendered output: investigate, don't bless.
- `tsc --noEmit` + `vite build` + `cargo test -p sim` + `cardGrid.test.mjs` green.
- **Grep proof:** zero references to the deleted class names / forked selectors remain; the
  count of chassis definitions is **1**. State this in the slice's results.
- **compare-screenshots** lab card-bar vs game card-bar — they should be the **same** render now
  — then an unprimed **screenshot-critique** as the last check, then **preview-shots**.

## Must stay green
Everything — this slice only deletes duplication. Any pixel movement is a bug, not a bless.

## Human review checkpoint (non-blocking)
"One token source, one card component, lab deduped, all baselines unmoved." Open the
lab-vs-game card-bar shots with preview-shots; the {0,0} pass is self-justifying. Silent
~5 min → accept, close Preview, then [close-spec](../../../.claude/skills/close-spec/SKILL.md)
archives this spec to `specs/done/` and rewrites it into a rationale record (also closing
`specs/battle-ui/` S1 — the shared-token extraction was this migration all along).
