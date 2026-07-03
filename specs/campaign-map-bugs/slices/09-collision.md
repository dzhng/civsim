# 09 — B7: one occupancy authority across labels and cards ★human

**Contract unlocked:** nothing readable overlaps — canvas labels vs canvas
labels (LONDINIUM under ARVERNI), cards vs cards (ROMA covering OSTIA/PORTUS's
title row), cards vs canvas labels. Evidence:
`assets/evidence/b7-londinium-arverni.png`, `b7-roma-ostia-cards.png`.
DELIBERATELY LAST among placement slices — arbitrates final geometry (needs 04
and 07; tuning collisions before placement lands means tuning twice).

## API seam (one collision owner)
- Grow the existing mapPass occupancy cull (`visibleLabels` /
  `collisionCulledLabels`) into the single authority:
  - the scene's card-position loop **reports** each visible card's screen rect
    per frame (MapCards already measures for its transform updates);
  - canvas label layout treats card rects as blocked (cards outrank labels);
  - faction labels join the arbitration (currently they don't — that's the
    LONDINIUM/ARVERNI hole);
  - card-vs-card resolves in the scene loop **using the same exported
    rect-math helper** (one overlap implementation): deterministic priority
    (higher-tier city wins), loser nudges along its land-side arc, then stacks,
    then hides.
- Stats keep the `collisionCulledLabels` shape (+ card entries) so scenes can
  assert outcomes.
- **Known risk to decide and pin:** cards position in the scene loop, canvas
  draws in mapPass — same-frame ordering vs an accepted 1-frame settle; either
  way, pin it with a scene assertion.

## What the human can see
- Overview (LONDINIUM/ARVERNI clear) + regional Roma cluster (both card title
  rows readable).

## ★ Human checkpoint (non-blocking)
Who-yields and nudge behavior is feel — show the Roma cluster; ~5 min; else
proceed on evidence and record the priority order chosen.

## Verification
- New scene assertions: visible card rects pairwise disjoint at regional zoom;
  named pairs clear; campaign-polish-markers green.
- compare vs both evidence crops; critique last.
- Oracle: covered by the final sweep (10) on all three shots.

## Firewalls
- No z-index/CSS stacking hacks as a collision substitute; no label recoloring;
  cards report, never arbitrate privately; visibility changes only, never
  color.
