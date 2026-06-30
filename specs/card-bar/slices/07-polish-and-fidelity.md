# Slice 7 — Polish + Total War fidelity (follow-ups)

The core card bar shipped (S1–S4, S6): a fixed-size, no-scroll, auto-stacking
Total-War strip of cards, each a baked 3D-model portrait that fills the 3:4 card
on a dark backdrop with name / count / live bars overlaid, clearing the minimap
and gated behind a min window size. These are the open polish items — mostly from
the unprimed screenshot-critiques and David's taste checkpoints. None block the
feature; each is independently shippable. **This is the goal for the next pass.**

## Critic callouts (integrated-bar review)

- **Infantry variants blur together at card size (high confidence).** The several
  front-facing swordsman looks are near-identical "blue blocky figure" silhouettes
  at 72px — only a helmet or a subtle weapon pose separates them. Options: bake
  per *class* instead of per *look*, crop tighter on the distinguishing kit, or
  decide the **name** carries disambiguation and the portrait only sets the vibe.
  The call to make: must the portrait alone tell two infantry types apart?
- **Artillery reads as a siege engine, not a soldier.** The artillery look is a
  ground object (ballista/cart) with no standing figure to anchor the card. Frame
  on the crew, or accept it as the engine's portrait.
- **TW-fidelity gaps vs `assets/reference-tw-cardbar.png`** (deliberate design vs
  polish — David's call):
  - Reference cards sit in one ornate bronze housing with a continuous frame;
    ours are individually-bordered cards with gutters. A shared frame/housing
    would read more "Total War" — the single biggest fidelity driver.
  - Reference puts a single full-width strength bar across the **top**; ours
    stacks three (hp/coh/mor) at the bottom. Ours carries more info (per spec) but
    has a different silhouette.
  - Reference shows a role icon and no name; ours overlays the name. (A choice,
    not a defect.)

## Other open polish

- **Portrait framing fine-tune.** Some heads sit close to the top edge. Nudge the
  per-look `LOOK_H` / zoom in `web/shots/models/scripts/soldier-cards.mjs` and
  re-bake. David's framing checkpoint.
- **Faction-variant portraits (deferred).** Portraits bake team-0 (blue) only;
  enemy cards rely on the `--fac` CSS border. If a neutral body reads as the wrong
  side at small size, bake a team-1 (red) set (the `-t1` filename hook) and pick by
  team in `cardThumbUrl`.
- **Constants sign-off.** `cardW 72`, `maxRows 3`, `MINIMAP_RESERVE 210`,
  `MIN_WINDOW 1180×640`, and the placeholder copy are all tunable, awaiting
  David's eyeball at the real battle camera.

## S5 (optional, still open)

Dedupe the two `.ucard*` CSS copies (`web/index.html` `<style>` + the lab
`installStyles`) — held up by the HTML-vs-TS-injection mismatch; do it only if a
clean shared source emerges. Optionally reconcile `scene.ts`'s raw-offset unit
reads onto `buildBattleUiModel` (camera-centering side-effect risk — the spec's
decision #3 keeps it optional).

## Verification

Every visual change re-runs the standing gates — [compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md)
against the reference and an unprimed [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) —
opens the shots for the user with [preview-shots](../../../.claude/skills/preview-shots/SKILL.md),
and re-blesses `card-bar-*` + the GPU `battle-selection-dpr2`. GPU bakes/renders
run headful with hardware flags (no headless WebGPU adapter on this machine).
