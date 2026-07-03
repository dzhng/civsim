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

## Ledger (landed, lane-cards)

**U-Ostia verdict (07a):** not a missing model. The entity pass uploads a
city-model instance for every city node (entity-dump probe: 412/412 present,
0 missing — `tools/entity-dump.mjs`, artifact
`assets/probe/entity-dump-07a.json`), and the model renders at the node
anchor. The evidence crop's "missing" model is the ROMA DOM card covering
Ostia's anchor point at the regional framing — the only covered anchor on the
whole map — compounded pre-slice-01 by the node itself sitting ~3.3 km at sea
(B1), which slice 01's snap fixed. Classification: not entity-culled, not
absent from data, not anchor-offset — DOM-card occlusion (B7's named
Roma/Ostia case) over a B1 position.

**07b:** no model fix needed — the data-side fix landed with slice 01's
re-bake (the true owner, mapgen). Gate held by the entity dump +
campaign-lod: model instance present at Ostia's node, and after 07c no
visible card covers any city anchor point (`anchorsCoveredByCards: []`).

**07c:** landward card offsetting in the scene's card-position loop
(`updateMapCardPositions` → `landwardCardOffset`, `web/src/campaign/scene.ts`).
Card rects scored edge-inclusive (5x3 grid incl. corners — the probe measures
corners) through `renderer.toWorld` + `field.renderLandAt`; sea-hanging cards
walk a fan around the inland ring direction (0/±45°/±90°, 8 px steps),
nearest fully-ashore candidate wins, best score otherwise. Guardrails: the
walk budget is 40 km of world (zoomed-out cards stay pinned to their marker)
and a model keep-out sized from the projected `cityModelRadius` footprint —
a card never parks on its own or a neighbor's city model. Offsets cached per
camera pose + viewport (`cardOffsetSig`). Plumbing: `MapCards.measure()` /
`CampaignHud.measureMapCards()` (DOM-measured card sizes) and renderer
`cityEntityAnchors` telemetry. No collision logic — card-vs-card overlap
stays with slice 09's occupancy authority.

**Probe (regional framing, card landFraction before → after):** CAPUA
0.8→1.0, COSA 0.2→0.8, MINTURNAE 0.4→1.0, OSTIA/PORTUS 0.4→1.0, ROMA
0.8→1.0, TARRACINA 0.4→1.0; every other visible card 1.0 unchanged. Named
exceptions: whole-map ROMA stays 0.2 (the card spans hundreds of km at that
zoom; the 40 km budget refuses to detach it from its marker) and COSA 0.8
(promontory corner — best ashore placement within budget).

**Evidence:** `assets/evidence/b5-after-ostia-card.png`,
`b5-after-minturnae-card.png`, `b5-after-regional.png` vs `b5-ostia-card.png`.
Neutral compare verdict: after-state correct — Ostia model on land, card
ashore; residuals belong to B7 (ROMA card covers OSTIA's title → 09) and B4
(jagged coastline → 05).

**Gates:** campaign-lod extended (`checkOwnCityCards` at regional-political +
rome-close: model present at each card's node, anchor uncovered, rect >= 0.6
land) — green. Full campaign suite + water-sea green (95 checks). Baselines
re-blessed for the card variable only: campaign-lod
regional-italy-{natural,political}, rome-close, selected-army-city,
selected-city, border-fog. Battle firewall: zero new failures (battle-input's
banner-plant red is one of the 13 pre-existing). Codex review: one P2
(offset cache not invalidated on viewport resize) — fixed.

**Handoff to 09:** ROMA/OSTIA and TARRACINA/MINTURNAE card stacks at the
regional framing are the remaining readability defects; all cards are ashore,
so 09 arbitrates pure card-vs-card geometry. 09 should consume the
post-offset rects the scene reports (or invalidate through `cardOffsetSig`).
