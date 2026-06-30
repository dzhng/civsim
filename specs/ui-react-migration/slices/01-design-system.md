# Slice 1 — One bronze token source

## Contract unlocked
The bronze tokens + chassis exist as **one importable CSS module**, consumed identically by
(a) Tailwind `@theme`, (b) the remaining vanilla `index.html` CSS, (c) the lab
`installStyles()`. **Zero visual change** — a pure extraction. This is the dedup the whole
migration delivers, landed first so every later slice builds on one source.

## API seam
- `web/src/ui/theme/bronze.css`:
  - `@layer base { :root { --bronze-fill … --well-hover } }` — the 8 tokens, verbatim from
    index.html `:root`.
  - `@layer components { .chassis { fill padding-box / edge border-box / 3px transparent /
    var(--bronze-frame) } .chassis-tray { the riveted card-bar chassis: 4 corner
    radial-gradients + brushed repeating-linear-gradient + fill/edge + 6-layer box-shadow }
    .well { … } }` — lifted from the `#unitcards` / `#toolbar` **literals** (which today do
    NOT use the vars — index.html already holds 2 literal chassis copies).
  - `@theme` maps `--color-bronze-ink`, a couple of `--shadow-*`/`--background-image-*` onto
    the same vars so Tailwind utilities resolve to one source.
- `index.html`: delete the `:root` block, `@import` `bronze.css`; replace the `#unitcards` /
  `#toolbar` literal chassis with `.chassis-tray` / `.chassis` references (still vanilla CSS on
  the existing DOM ids — no React yet). Move `@font-face`/Cinzel with the head if needed.
- The lab `installStyles()` and `panels.ts` are **left as their own copies this slice** —
  deduped in S7; S1 only establishes the one source they will adopt.

## What a human can run / see
The live game and `/renderer/card-bar` look **identical**; the chassis is now one class, not
three literal copies.

## Verification
The win condition is **pixel-identity**. Run `card-bar` (`card-bar-{20,30,40}{,-2x}`,
`card-bar-too-small`), `battle-renderer-visual` (`battle-selection-dpr2`),
`menu-renderer-shell-visual` at **{threshold:0, maxDiffRatio:0}** — they **must pass without
re-bless**. A forced re-bless here = the extraction drifted a value; investigate, don't bless.
`tsc`/`build` green; `cardGrid.test.mjs` green.

## Must stay green
All visual baselines, unchanged. The lab card-bar route (still on its own copy this slice).

## Human review checkpoint (non-blocking)
"Tokens are one file; game pixel-identical; no baseline moved." Open the before/after card-bar
+ menu shots with preview-shots; the (0,0) pass is self-justifying.

## Risk handled
"Tailwind can't express the bronze gradients/bevels." Correct — it shouldn't. The riveted/
brushed/6-layer chassis stays hand-authored in `@layer components`; Tailwind owns only flat
tokens. This thin custom layer is the design, not a smell.
