# 07 — B5: card anchors + the missing Ostia model (diagnose → fix → fix)

**Contract unlocked:** every own-city card sits beside a visible city model
with its box on land where an inland offset exists; the OSTIA/PORTUS model
renders. Evidence: `assets/evidence/b5-ostia-card.png` (card floating over open
sea, NO model at its anchor). Depends on 01 (re-bake may move/fix Ostia — the
diagnosis is only valid on final positions).

## 07a — diagnose the missing model (resolve before touching cards)
Reproduce post-rebake, then classify:
- entity culled (the campaign entity pass / land cull rejecting an offshore
  node — may vanish after 01);
- absent from data (a bake post-step victim — check the prune scripts);
- render/anchor offset (model drawn elsewhere).
Artifact: an entity-dump probe (every city node → model instance present y/n)
+ a one-paragraph verdict. Resolves U-Ostia.

## 07b — fix the model at its true owner
Data-side → mapgen + re-bake (never JSON). Cull-side → the entity pass rule.
One visual variable: model presence. Gate: model visible at the Ostia anchor.

## 07c — land-aware card anchoring
- In the scene's card-position loop (the one projection consumer:
  `toScreen`/`screenToWorld` only), score the candidate card rect's world
  footprint via the full-res mask and offset shoreward cards to the land side
  (MINTURNAE's half-overhang). Cards remain DOM; MapCards/panels.ts untouched
  beyond offset plumbing. No collision logic here — 09 owns it.

## What the human can see
- Regional capture with OSTIA/PORTUS (model + card ashore) and MINTURNAE
  correct.

## Verification
- campaign-lod DOM-card assertions extended: every own-city card has a model at
  its anchor and a mostly-land rect; probe green.
- compare vs the evidence crop; critique last.
- **LANE close-out oracle (with 05+06):** find-map-bugs on the regional shot —
  card-over-sea, missing-model, jagged-coast, scenery-on-water classes all
  absent, no new findings.

## Firewalls
- Faction-banner card styling (variation C) untouched; two-color rule; one
  projection owner.
