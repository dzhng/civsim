# 02 — Extract `<Chassis>` housing primitive

**Structural. Pixel-identical. Re-bless nothing.**

## Contract unlocked
One reusable bronze-housing primitive replaces the four hand-rolled inline
recipes, so slices 03–07 style three cards from one source instead of editing
four blocks. Finally lands the `.chassis` class the `bronze.css` comment
anticipates.

## API seam
- Add `.hud-chassis` (+ `.hud-chassis--tray` for the ornate 6-layer riveted /
  brushed-grain variant currently unique to `#unitcards`) to the co-located HUD
  stylesheet (from slice 01) or `bronze.css`. The base recipe: `border … solid
  transparent; background: var(--bronze-fill) padding-box, var(--bronze-edge)
  border-box; box-shadow: var(--bronze-frame)`.
- Thin `<Chassis variant="plain" | "tray">` wrapper in `web/src/ui/hud/`. Refactor
  `<LeftInfoCard>`, `<CenterCard>`, `<RightMinimapCard>` onto it, reproducing each
  surface's *current* chrome exactly (left/right/toolbar = `plain`, card grid =
  `tray`).
- Optional `<Well>` / `.hud-well` (rim-light + inner-shadow, from `--well-*`) for
  the stat bars and card wells if it falls out cleanly; skip if it forces a pixel
  change.

**Pixel-safety caveat:** the lab keys off the `#unitcards` id rule (id specificity
beats `.renderer-unitcards`). Keep the id rule alive or scope the lab so
`card-bar.mjs` does not shift.

## What the human can run / see
`bun run --cwd web scene -- battle-selection` — no visible change.

## Verification
- `battle-selection-dpr2` and `card-bar-{20,30,40}` **byte-identical — NO
  re-bless.** If pixels shift, the extraction was not faithful; fix the recipe.
- No new shot → no screenshot-critique needed; byte-identity is the gate.

## Stays green
All HUD baselines (unblessed), the lab, the 60 Hz firewall.

## Feedback that would change this slice
If a truly faithful `<Chassis>` proves impossible without a sub-pixel diff on the
ornate tray, keep the tray as bespoke CSS for now and only extract the `plain`
variant — do not bless a diff to force the abstraction.
