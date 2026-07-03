# 04 — B2 + B8: land-aware city-label anchoring ★human

## LEDGER (shipped 2026-07-03, lane-city-labels)

**Anchor policy (one visual variable: city-label placement).** The emitter in
`web/src/campaign/renderer.ts` stopped hardcoding a single screen offset; it
authors preference-ordered `placementCandidates` and the label pass picks:
- *Overview (marker-attached, cam.scale < 0.6):* the classic below-right of
  the square marker first (the tiebreak — inland labels never move), then its
  mirrors around the marker (left/above/sides/center-column), in three
  marker-clearance rings (`OVERVIEW_LABEL_RING_SCALES` = 1 / 2.2 / 3.6 × the
  marker outer-edge clearance). Outer rings only win when no ring-1 spot is
  clean — a whole-map label box spans hundreds of km; isthmus cities trade a
  little detachment for ink on land. Edge offsets shift all candidates alike.
- *Closeup (model-attached):* centered below the model at the relief-aware
  height first, then sideways slides keeping `CLOSEUP_LABEL_MARKER_TIE_PX`
  (14 px) of overlap with the marker column so a slid label still reads
  attached (B8: a long coastal name's seaward edge pulls back ashore); above
  the model (centered, then slid) is the last resort.
- Markers never move — labels move around them. No per-city special cases.

**Scorer reuse (the one placement owner).** The city-label chooser calls the
SAME `bestPlacement` slice 03 built (`mapPass.ts`, one definition, two
callers: sea-label fitter + city labels). Polarity is the caller's:
`isBadAt` = water for city labels. Samples are the candidate's measured ink
rect (true atlas metrics, halo padding excluded) taken through
`screenToWorld` on the real camera against slice 00's full-res render mask
(`TerrainField.renderLandAt`, threaded as `renderSurfaceAt` at upload). First
fully-clean candidate wins, else least-bad earliest. Two supporting fixes:
composed garrison labels cull their city's plain label by collision *group*
(not rect overlap), so an anchor-placed label can't resurrect beside the
composed one; the triplicated anchor-center math is one helper. Telemetry:
label-pass stats export `visibleCityLabelRects` (+`padPx`), read-only.

**Probe numbers** (tools/render-probe.mjs cityLabels, landFraction, gate
>= 0.95 both framings; counts at the pre-placement baseline):
- whole-map-political (count 10 → 10): TARRACO 0 → 1.00, CORINTHUS 0.088 →
  0.802 (named exemption >= 0.80 — justification in the checkpoint note
  below and tools/README.md), LEPCIS MAGNA 0.154 → 1.00, CORDUBA 0.363 →
  1.00, MEDIOLANUM 0.637 → 1.00, COPTOS 0.758 → 1.00, IERUSALEM 0.923 → 1.00,
  EPHESUS 0.956 → 1.00; rest 1.00.
- regional-italy (count 21 → 21): PUTEOLI 0.33 → 1.00, POPULONIUM 0.396 →
  1.00, ALERIA 0.527 → 1.00, CASTRUM TRUENTINUM 0.549 → 1.00 (B8), SIPONTUM
  0.571 → 0.978, POMPEII 0.681 → 1.00, SALONA 0.692 → 1.00, SALERNUM 0.703 →
  1.00; rest 1.00.
- No regression elsewhere: sea labels max 0.027 land (AEGEAN, = 03's ledger),
  offshoreCities / cards / scenery sections byte-identical to the pre-04
  probe. Close-out probe run twice: byte-identical output (deterministic).

**Gates on the final tree:** typecheck + lint + unit (80/80) green; full
`campaign water-sea` scene suite green against the worktree server
(campaign-lod / campaign-frame re-blessed in-slice, attribution verified —
parent tree diffs 0 px on whole-political/regional-political/border-fog).

**Evidence:** `assets/evidence/b2-after-{tarraco,corinthus,overview}.png`,
`b8-after-castrum-truentinum.png` vs `b1-tarraco.png` / `b1-corinthus.png` /
`b8-castrum-truentinum.png` — fresh close-out captures re-verified: TARRACO
icon+name fully inland beside its coastal marker, CORINTHUS ashore above its
marker on the isthmus, CASTRUM TRUENTINUM entirely on land at regional.
Unprimed critique on the fresh whole-map capture ("do any city names or icons
sit on open water?"): walked all 10 city labels + coastal markers — clean, no
city name or icon on water.

**LANE LABELS close-out oracle (find-map-bugs, fresh whole-map political
capture): PASS** — full report + judge crops in
`assets/oracle/wholemap-closeout-04/`. 9 tile finders → 7 merged candidates
→ 7 adversarial judges. Gate classes: sea-label-on-land ABSENT; zero NEW
label-detached / city-label-on-water findings (the one PARTIAL hit is the
documented CORINTHUS exemption, reconciled below). Refuted: 4 (two waterline
port markers, one by-design faction engraving, one engraving misread as a
city label). Confirmed-and-routed, all pre-existing classes this slice does
not own: army-label overprint at Pella/Thessalonica → 09 (collision
authority); DIOSCURIAS engraved faction name ~55% over the Black Sea and
engraved IERUSALEM shifted ~50% over Egypt → faction-name placement bucket
for David / slice 10.

**★Human checkpoint (non-blocking) — proceeded on evidence, recorded.**
Placement is taste; David reviews the overview + regional captures async on
the committed evidence (b2-after-overview / b2-after crops). Residual taste
note, sharpened by the oracle: CORINTHUS holds the 0.802 exemption — the
render mask (the spec's land authority) shows a real isthmus land strip
under ~3/4 of the ink band with strait water under the right tail (ASCII
mask dump in the oracle report), but at the 0.16 whole-map zoom that
sub-marker-width strip blends into the gulf and BOTH fresh-eyes passes (the
tile finder and the adversarial judge) read the name as sitting on water,
~45-50 px ring-detached from its marker. The alternatives measured worse
(first >= 0.95 spot ~285 km away = true label-detached). If David rules the
blended read unacceptable, the follow-up is the B8-style escalation
micro-slice (e.g. leader-line or isthmus-priority candidate), not a tweak
inside this one.

---

**Contract unlocked:** overview city labels sit on land beside their marker —
no more TARRACO/CORINTHUS names floating in the sea — and long names (B8:
CASTRUM TRUENTINUM) stay ashore because the score uses the full measured text
box. Evidence: `assets/evidence/b1-tarraco.png` (the label half),
`david-corinthus-label-water.png`, `b8-castrum-truentinum.png`.
Depends on 01 (anchors moved) and 03 (the shared scorer exists).

## API seam (one label system; one placement owner)
- The city-label layout in mapPass calls the SAME placement scorer slice 03
  built: candidates right/left/above/below the marker, scored by land-fraction
  of the full text box (true atlas metrics), current below-right kept as the
  tiebreak so inland cities don't churn. The emitter in `renderer.ts` stops
  hardcoding a single screen offset and requests a placement.
- Markers do not move — labels move around them.
- **B8 is an acceptance check, not a mechanism**: if the anchor chooser can't
  land Castrum Truentinum's second word, escalate to a follow-up micro-slice
  (do NOT bolt wrapping into this one).

## What the human can see
- Overview capture; crops of TARRACO, CORINTHUS, CASTRUM TRUENTINUM.

## ★ Human checkpoint (non-blocking)
Label placement is taste — overview + one regional shot; ~5 min; else proceed
on evidence and record.

## Verification
- Probe: those three label bboxes mostly-land; visibleLabels count within
  tolerance of before (placement must not trigger a collision bloodbath — 09
  owns collisions proper).
- campaign-lod + campaign-polish-markers re-blessed once; critique last.
- **LANE LABELS close-out oracle:** find-map-bugs on the whole-map shot —
  sea-label-on-land AND label-seaward classes absent, no new findings.

## Firewalls
- No per-city special cases; no DOM involvement; army/faction emitters
  untouched; a second placement implementation is a review-reject.

## 04b — reversal (David's rule, 2026-07-04)
Slice 04's land-aware anchoring overcorrected: to put a label on dry ground the
scorer let it detach far from its marker (CORINTHUS across the gulf, TARRACO up
the coast). David's rule: **a city label just hugs its marker, always — only
sea/ocean names care about dry ground.** So the land-aware placement is gone for
city labels:
- `OVERVIEW_LABEL_RING_SCALES` = `[1]` (was `[1, 2.2, 3.6]`): the only candidates
  are the eight ring-1 hug positions around the marker. Detachment is now
  structurally impossible — a city label is at most one marker-clearance from its
  square, or hidden.
- `placeCityLabel` no longer scores candidates by water (the `bestPlacement`/
  render-mask block, `CITY_LABEL_MAX_WATER_FRACTION`, and
  `anchoredLabelWorldSamples` are deleted). It takes the first hug position whose
  ink rect is unclaimed — so an unobstructed label keeps the classic attached
  anchor and a blocked one dodges to another side of the SAME marker (slice-09
  collision), never away.
- A coastal name (CORINTHUS, TARRACO, ports) may now read partly over water —
  that is correct: it sits on its city. The probe's `cityLabels[].landFraction`
  becomes informational, not a gate (see tools/README.md).
The B2/B8 originals stay fixed (labels no longer float in open sea away from
their cities) — just by hugging instead of by scoring.
