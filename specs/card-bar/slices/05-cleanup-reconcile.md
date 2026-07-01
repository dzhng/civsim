# Slice 5 — (Optional, droppable) dedupe CSS + reconcile the data path

> **This slice is optional and reversible.** The feature is complete and shippable
> after S4. Do this only if the cleanup proves clean; if `scene.ts`'s
> camera-centering selection makes the data-path migration messy, **drop it** —
> nothing downstream depends on it.

## Contract unlocked

One CSS source of truth for the card bar instead of two near-duplicate copies, and
(optionally) one data-extraction path instead of `scene.ts`'s hand-rolled raw
float offsets sitting beside `buildBattleUiModel()`'s symbolic reads.

## API seam

Two independent, separately-landable cleanups:

1. **Dedupe the card CSS.** The grid/portrait rules now live in both
   `web/index.html` and `apps/renderer-lab/src/router.ts` `installStyles()`.
   Extract them into one shared string/`.css` imported by both build paths, or at
   minimum reconcile the two blocks and leave a comment pointing each at the other.
   Pure refactor — no visual delta expected.

2. **Reconcile the data path (the genuinely optional part).** `scene.ts:688`
   `buildCards()`/`updateCards()` read wasm by **raw literal index** (`info[o+13]`
   etc.) — a silent-breakage hazard if `unitInfoLayout.ts` ever shifts.
   `uiLayer.ts` `buildBattleUiModel()` already does the same extraction by
   **symbolic `UNIT_INFO` name**, with player filtering and look resolution.
   Migrate `scene.ts` to feed `buildBattleUiModel(game, wasm.memory, opts).cards`
   into its `UnitCards`, **keeping** its camera-centering `onSelect`. If that
   side-effect entangles badly, stop — this half is not worth churn in the live
   frame loop.

## What a human can run / see

`?battle=5v5` behaves identically; the lab card routes look identical. The win is
in the diff, not on screen.

## Verification

- All battle + lab UI scenes green with **no re-bless expected** (pure refactor —
  if pixels move, something is wrong).
- `battle-selection` still selects and centers the camera.
- The grid/img scenes from S2/S4 unchanged.

## Must stay green

Everything. This slice introduces no behavior.

## Human review checkpoint

David confirms the diff is mechanical and there is no visual or behavioral delta.
If part 2 (data path) looks risky next to the camera-centering selection, he
approves dropping it and keeping only part 1 (CSS dedupe).

## Feedback that would change this slice

- "Don't touch the hot loop" → keep part 1, drop part 2 entirely.
- "Shared CSS import doesn't fit the two build setups" → settle for reconciled-
  but-duplicated blocks with cross-reference comments.
