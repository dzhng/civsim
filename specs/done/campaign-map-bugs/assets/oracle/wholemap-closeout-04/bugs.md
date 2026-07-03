# find-map-bugs — LABELS-lane close-out oracle (slice 04)

- Shot: fresh whole-map political capture from the lane-city-labels worktree
  server (:5208), 1600x1000, camera (-100, 250, 0.16), frozen/fog-off/faction
  view — `wholemap-closeout-04.png` (copy of throwaway/closeout-whole-map-political.png).
- Pipeline: code-derived legend → 3x3 tile fan-out (9 opus finders; 4 stalled
  at spawn and were nudged per the spec's known fan-out stall) → merge (7
  candidates) → 7 adversarial opus judges with pan/zoom crop loops.
- Run date: 2026-07-03. Gate for this lane: sea-label-on-land and
  label-detached / city-label-on-water classes absent; no new confirmed
  findings. Other classes are routed, not gate failures.

## Verdict by class

| Class | Result |
|---|---|
| sea-label-on-land | ABSENT — every sea name judged/probed on water (probe max 0.027 land, AEGEAN) |
| city label/icon on water | no NEW finding — single PARTIAL hit is the pre-documented CORINTHUS exemption (below) |
| label-detached | no NEW finding — only the CORINTHUS ring-detachment bundled in the same exemption |
| label-collision | 1 confirmed, army-label class → routed to 09 |
| other (faction engraved names) | 2 confirmed → routed (see below) |
| road-missing / road-dead-end | not judgeable at whole-map zoom (roads legitimately fade); 02 owns roads at regional |
| jagged-water-edge | none reported by any finder |

## Candidate ledger (7 merged, full-image coords)

| # | type (claimed) | bbox | verdict | crop |
|---|---|---|---|---|
| C1 | city-on-water CORINTHUS | 934,545,82,24 | PARTIAL — known exemption, reconciled below | c1-corinthus-r2.png |
| C2 | label-collision 1ST/2ND LEGION (Pella/Thessalonica) | 930,478,104,34 | CONFIRMED — army labels overprint ink-on-ink; → slice 09 (collision authority). Pre-existing class: army emitter untouched by 04; visibleLabels counts unchanged vs pre-04 baseline | c2-legion-collision-final.png |
| C3 | city-on-water DIOSCURIAS | 1351,282,95,32 | REFUTED as city-on-water — element is a faction ENGRAVED NAME (no icon/marker/halo); ~55% coastal overspill into the Black Sea = class other, routed (faction emitter, pre-existing) | c3-dioscurias-r2.png |
| C4 | other: faint text over land (SW Iberia) | 95,655,180,60 | REFUTED — engraved faction name over its own territory, by-design opacity | c4-faint-text-r3.png |
| C5 | other: engraved IERUSALEM west-shifted | 1333,850,155,50 | CONFIRMED — engraving center pinned on the Egypt border, ~50% ink over the neighbor while the realm is wide enough to hold the centered word; class other, faction-name placement, routed (pre-existing; the CITY label IERUSALEM sits correctly on land — probe 1.00) | c5-ierusalem-final.png |
| C6 | city-on-water marker, Iberian coastal tip | 336,410,24,24 | REFUTED — waterline port: ~70-80% of the marker footprint on solid land with the road network feeding it; the coastline runs exactly at its base | c6-iberia-marker-r2.png |
| C7 | city-on-water marker off Carthage | 699,788,24,24 | REFUTED — marker inside purple territory on the mainland waterline; not Melita, not offshore | c7-carthage-marker-final.png |

Refuted: 4 of 7. Confirmed-and-routed: 3 (C2 → 09; C3, C5 → faction-name
placement bucket for David / slice 10). Gate-class new findings: 0.

## C1 CORINTHUS — the judge/probe reconciliation (the one gate-class hit)

The judge ruled PARTIAL: house icon on land (refuting "clearly offshore"),
square marker on land, but read ~80% of the NAME glyphs as sitting over gulf
water, ~45-50 px from the marker. The deterministic render mask says the
opposite weighting: sampling the same ink band through `renderLandAt` gives
0.75 (4 px grid) / 0.802 (probe sampling) LAND — an ASCII dump of the mask
under the box shows a continuous isthmus land strip under the left ~2/3 of
the glyphs with strait-water gaps under the right tail:

```
.....llllLLLLLLLLLLL~~~~LL~~~~~~~..........   (L/~ = in-box land/water,
....l.llllLLLLLLLLLLLLL~~~LLLLL~~..........    l/. = neighborhood)
....l..lllLLLLLLLLLLLLLLL~~LLLLL~~.........
........llLLLLLLLLLLLLLLLLL~LLLL~~.........
........llLLLLLLLL~LLLLLLLLL~~~L~~.........
```

Both are honestly reporting different truths: the mask (the spec's land
authority, bake-pinned) says the label is mostly on land; fresh eyes at the
0.16 whole-map zoom see that sub-marker-width isthmus strip blend into the
gulf and read the name as "on water". This is exactly the residual the slice
ledger records as the named exemption (>= 0.80 gate, offset sweep found no
>= 0.95 placement within 100 px; first clean spot ~285 km away = the worse
label-detached class). NOT a new finding; tagged known-exemption and
escalated verbatim into the ★human checkpoint note for David's taste call.

## Gate ruling

PASS. sea-label-on-land absent; no new label-detached / city-label-on-water
findings; the three confirmed findings are routed classes (army-label
collision → 09; two faction engraved-name placements → David/10) with their
crops archived here.
