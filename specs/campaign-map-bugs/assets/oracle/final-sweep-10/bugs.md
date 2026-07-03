# Final sweep (slice 10) — find-map-bugs on the three canonical shots

Date 2026-07-04. Tree: all 11 slices + David's 04b/04c label-hug refinements.
Method: code-derived legend → 3×3 tiles per shot → fresh-eyes opus finders per
tile → adversarial judging of every candidate. Fresh captures at 1600×1000,
frozen sim, faction view.

## Verdict: GREEN — zero confirmed findings in any fixed class (B1–B9), zero new confirmed defects.

### whole-map political (18 finder-passes across two sweeps)
- Every city label hugs its marker — Tarraco, Corinthus, Lepcis Magna, Corduba,
  Londinium, Mediolanum, Constantinopolis, Ephesus, Ierusalem, Antiochia all
  confirmed sitting directly under/beside their square (04b/04c). The two
  detachment flags from the first sweep (Tarraco, Lepcis Magna) are GONE after
  04c's directly-below anchor — re-swept clean.
- All 8 sea names in open water: Black Sea, Adriatic, Aegean, Ionian,
  Tyrrhenian, Mediterranean, Iberian, Atlantic. (B3 stays fixed.)
- No city on water; coastlines/washes stop at the drawn coast (B1/B4 fixed).

### regional-italy political
- Covered GREEN by the gpu/scenery/cards lane close-out oracle on the identical
  framing (assets/oracle/regional-closeout-05-06-07) + the current all-green
  render-probe: cards mostly-land (COSA promontory corner the sole named
  exception), scenery 0 on water, roads reach Cosa/Tarracina/Ostia/Puteoli,
  coast smooth. Not redundantly re-swept.

### black-sea crop (9 finder-passes)
- Every city on land with its label hugging: Olbia, Tyras, Kalos Limen,
  Chersonesos, Theodosia, Pantikapaion, Gorgippia, Tanais (verified in a
  panned-east capture, black-sea-cities-on-land.png). Scenery all on land
  (B9). Coasts smooth (B4). The one 0.72 "detached label" flag was Gorgippia
  clipped at the original frame's right edge — on land, label hugging, just
  frame-clipped; not a defect.

## Non-defects observed (intended-by-code / already-routed — NOT gate failures)
- Composed garrison labels: a legion name stacked over its occupied city
  (1ST LEGION / CARTHAGO) reads as a "collision" to fresh eyes but is the
  designed composed label (slice 09).
- Faction engravings overhanging coasts (SELEUCIDS, DIOSCURIAS) and faint
  same-name league engravings under a city label (CONSTANTINOPOLIS): the
  background-scale engraved-name class — **for David's ruling** (below).
- Small islets off the north Black-Sea coast: real land features at coarse
  raster resolution (the island-fidelity class — David's ruling).

## Open items for David (taste rulings, not defects — carried from the lanes)
1. Island-fidelity: real small islands (Populonium pill, Melita, Black-Sea
   islets) render as coarse faction-color lozenges at whole-map zoom.
2. Engraved-name placement: major faction names sit at the territory centroid
   and can overhang a coastal border or graze a same-name city label.
3. Southern-Italy grey "Independent" fill reads as missing color beside the
   vivid powers.
4. City-label collision-dodge (04c): a crowded city label shifts to another
   side of its OWN marker to stay readable — offered as keep vs
   fixed-position-then-hide.

## Stay-green (this sweep's tree)
cargo mapgen+campaign, web typecheck/lint/unit (80), all campaign + water-sea
+ campaign-collision scenes, render-probe all sections — green. Battle firewall:
the 13 documented pre-existing failures only, zero new.
