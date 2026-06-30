# Slice 2 — Menu proof (first React surface)

## Contract unlocked
The whole main menu (`#menu-ui`: title, GPU-status line, Campaign / Quick-Battle / Field-Manual
sections, **and the duel modal**) is React, mounted by `MenuScene`, pixel-matching the current
bronze menu. Proves the stack + bronze theme + the scene-mount seam on a **static, GPU-free**
surface — the lowest-risk first cut.

## API seam
- `web/src/ui/menu/Menu.tsx` — `<Menu {...MenuConfig} />`. Props mirror today's `MenuConfig`
  (`onQuickBattle`, `onDuel`, `onCustomBattle`, `classSpecs`, `onNewCampaign`, `onLoadCampaign`,
  `hasSave`, `gpuStatus`) — the contract already exists, so `main.ts` wiring is unchanged.
- `MenuScene.enter()` → `createRoot(#ui-root).render(<Menu …/>)`; `exit()` unmounts. `Scene`
  interface and `switchScene` untouched.
- GPU-off disabling, Esc-closes-modal, and `data-battle` buttons become React state/handlers.
  The duel modal is local `useState` (two `<select>` ids + AI checkbox).
- The **army builder stays vanilla this slice** — `<Menu>` renders the `#quick-battle-modal`
  shell and the existing `mountQuickBattleSetup` still drives it (migrated in S4). Coexistence
  behind a button is fine.
- Menu markup leaves `index.html`; bronze classes become Tailwind utilities + `.chassis`/`.well`.
- **Inherited from S1 (deferred here):** add the `.chassis` / `.chassis-tray` / `.well`
  component classes to `bronze.css` and the Tailwind `@theme` bridge (mapping `--bronze-*` /
  `--well-*` onto utilities) — this slice is the first React consumer that applies them, so it
  owns wiring them. Decide preflight here too: scope or skip Tailwind's reset so the still-vanilla
  surfaces don't move (S1 deliberately imported utilities-only, no preflight).

## What a human can run / see
Boot to menu; hover/click every button; open the duel modal; toggle AI; see GPU-unavailable
disabling — all React, visually identical; deep links (`?battle=5v5`, `?campaign`) still boot
straight in.

## Verification
- `menu-renderer-shell-visual` snaps re-blessed **only if** React's whitespace/text-node
  reflow nudges pixels past the tolerant budget — aim for no-re-bless; re-bless is a reviewed
  change, flagged.
- **Add a `menu-modals` snapshot** of the open duel + quick-battle modals — none exists today,
  and S4 needs a gate to preserve.
- `tsc`/`build` green.
- **compare-screenshots** the React menu against the archived vanilla baseline; **unprimed
  screenshot-critique** as the last check; then **preview-shots**.

## Must stay green
Every battle/campaign scene (the menu is their launcher); `card-bar` (untouched); the GPU-off
disabled-button path.

## Human review checkpoint (non-blocking)
David plays the menu in `npm run dev` and confirms the bronze look is indistinguishable and the
stack feels right — the "proof of stack + theme" gate before committing to the wave. If silent
~5 min and compare-screenshots says "no worse", accept and record.

## Risk handled
"Screenshot harness with a React tree" — low risk (the harness shoots pixels, not a vtree). The
only hazard is React whitespace text nodes nudging AA; the tolerant default absorbs it.
Discovered cheaply here on the GPU-free menu.
