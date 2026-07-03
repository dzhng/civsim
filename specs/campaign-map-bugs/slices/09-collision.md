# 09 — B7: one occupancy authority across labels and cards ★human

## LEDGER (shipped 2026-07-04, lane-collision)

**The arbitration design (one collision owner).**
- `arbitrateLabelOccupancy` in mapPass replaced the old pair of
  placeAnchoredLabels + composed-group cull: ONE claim pass over one claim
  list, from which every label verdict falls out. The scene's card loop
  REPORTS its post-arbitration card rects + culls into `renderer.draw()`
  (`cardRects` / `cardCollisionCulls`); the label pass takes them as
  pre-claimed ground (`CampaignLabelPlacementStyle.blockedRects`). Card rects
  join the atlas key, so a card that moves re-arbitrates the labels.
- **One rect math:** `ScreenRect` + `rectsOverlap` exported from mapPass; the
  scene's card-vs-card pass and the label arbitration both call it. Labels
  collide on their INK rect (atlas box deflated by halo padding — the
  transparent margin must not make text yield to empty air); cards on their
  full DOM chip rect.

**Who yields (the ★human priority order — proceeded on evidence, recorded):**
1. DOM cards (player UI) — outrank all canvas labels.
2. Faction engravings (major): claim their ink against same-scale text but
   neither yield to nor contest cards — a chip over a territory-scale
   engraving reads fine (same reasoning that exempts sea names); hiding a
   nation's name would not.
3. Minor faction (league) names — label-scale text; yield by hiding.
4. Army labels — fixed anchors on moving stacks; yield by hiding (marker
   stays). A composed garrison label that loses its ground releases its
   city's plain label back into arbitration (group-cull now keys off
   SURVIVING composed labels).
5. City labels, tier desc — the only movable text: candidates that land on
   claimed ground are dropped, the shared `bestPlacement` scorer picks among
   the survivors (isBadAt = water). Dodge first, hide last.
- Sea labels and sub-0.3-opacity fades (`OCCUPANCY_MIN_OPACITY`) stay out on
  both sides: background text / ghosts. This is why faint same-name league
  engravings can still sit under their capital's crisp city label at overview
  (opacity ≤ 0.157) — that's the engraved-name placement bucket already queued
  for David at 10, not an arbitration hole.
- **B2 stays closed under occupancy pressure:** a displaced city label may
  take a spot at most `CITY_LABEL_MAX_WATER_FRACTION` (0.25) wet, or as wet
  as its own unconstrained best (which preserves the named CORINTHUS 0.802
  exemption); wetter than both → hide. This is what hides LEPCIS MAGNA at
  whole-map (its pre-09 spot overprinted the CARTHAGE engraving; every clear
  alternative is sea) and PUTEOLI at regional (its ground is under the CAPUA
  card, which outranks it).

**Card-vs-card (scene loop, same rect math):** deterministic priority —
city tier desc, then armies, emitter order breaks ties. Loser nudges along
its land-side arc (the slice-07 landward fan; away-from-blocker when the
coast gives no signal), holding its own land floor and never covering a
city-model anchor; then stacks below the winner (land floor enforced); then
hides (`card:<NAME>` in the cull stats). Sizes are cached across frames so a
culled (display:none) card stays a contender instead of flickering.

**Ordering decision (pinned by scene assertion):** the scene pins the frame
camera (`renderer.setFrameCamera`) BEFORE the card loop, then draws — so
every MEASURED card is arbitrated and reported same-frame. A card entering
visibility has no measurable DOM size yet and joins one frame later: an
accepted ≤1-frame settle on visibility transitions only. Both halves are
asserted in `campaign-collision` (frame-1 stats already match the frame's own
DOM; frame 2 has every visible card arbitrated).

**Stats:** `collisionCulledLabels` keeps its shape and now carries faction/
army entries + scene-reported `card:` entries (cap raised 16→64);
`visibleArmyLabelRects` / `visibleFactionLabelRects` (with `minor`) /
`visibleCardRects` added so scenes assert outcomes; renderer-lab campaign-map
publishes the cull telemetry too.

**Named-pair verdicts:** Londinium/Arverni CLEAR at overview (label dodges to
the ring above the marker; rects disjoint). Roma/Ostia cards: OSTIA/PORTUS
stacks below ROMA, full title row readable. Tibur/Roma: TIBUR nudges
up-right, disjoint. Minturnae/Teanum (+ Tarracina/Casinum pile): all four
visible and pairwise disjoint. Pella/Thessalonica: the overprinting composed
army labels yield to the MACEDON engraving at overview (PELLA's city label
returns beside its marker); at regional both legions read cleanly —
`collision pella` asserts no readable overlap.

**Verification:** new scene `web/scenes/campaign/campaign-collision.mjs`
(global no-readable-overlap across labels/cards at overview + Roma regional +
Pella framings, named pairs, ordering pin; 2 new baselines). Probe green on
ALL sections, byte-consistent with the merged-tree gates: cityLabels ≥0.95
with only the CORINTHUS 0.802 exemption (whole-map count 10 — LEPCIS MAGNA
yields, PELLA released; regional count 20 — PUTEOLI yields), sea ≤0.05,
cities 12 known exemptions, cards modulo whole-map ROMA, scenery 0/0.
compare-screenshots + neutral fresh-eyes review vs both evidence crops:
defects gone. Unprimed critique on the four final captures found no
readable-overlap in the arbitration's scope; residuals it raised are the
faint engraved-name class (→10), army MARKER sprites over city icons
(markers are not labels — out of B7's text contract, noted for David),
jagged coastline (island-fidelity pill →10), dual border ribbon (locked
invariant #4). Codex review: 3 findings (culled-card flicker, wet-nudge
fallback, army card name mismatch) — all fixed and re-verified.

**Baselines re-blessed (collision geometry only; noise-only diffs restored):**
campaign-lod ×9 (whole-{political,natural,fog}, regional-italy-{natural,
political}, rome-close, selected-{army-city,city}, border-fog),
campaign-frame-zoomout-{wide,tall}, tiny-army-neutral-city (NEAPOLIS label
dodges the 1ST LEGION card), water/campaign-sea-{near,far} (the far chart's
league-name jumble now arbitrates: 34 minor engravings yield at that stress
zoom — the ★taste residual for David), + 2 new collision-* baselines.
campaign-polish-markers, map-alignment, polish-roads, campaign-visual (rest)
byte-identical.

**Evidence:** `assets/evidence/b7-after-londinium-arverni.png`,
`b7-after-roma-ostia-cards.png` vs the `b7-*` defect crops.

**renderSurfaceAt/roadSurfaceAt twin note (routed from the merge):** this
slice did NOT touch the `buildCampaignMapDrawData` style seam — the twin
callbacks (`renderSurfaceAt`/`roadSurfaceAt`, both delegating to
`renderLandAt` in web/src/campaign/renderer.ts) still await unification;
left for 10/close-spec since collision work runs through
`CampaignLabelPlacementStyle`, not that boundary.

---

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
