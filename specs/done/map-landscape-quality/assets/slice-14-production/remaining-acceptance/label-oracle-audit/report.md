# Regional label coverage audit (read-only)

## Diagnosis

The remaining red is **not proof of missing or unreadable names**. The existing
oracle measures near-white coverage of the entire screenshot. Own-city DOM
titles are real readable names and legitimate content, while roads/models
and non-title HUD pixels are different contributors; the scalar cannot
distinguish them or guarantee coverage of each owner. Current
retained evidence supports improved readable canvas labels, but does not by
itself prove every city/card title is readable or correctly associated.
Keep the current .002 gate unchanged until its replacement/retirement is an
explicitly reviewed test decision; no font or color adjustment is justified
merely to increase this total.

## Proven history and purpose

- Earliest introduction found for this file: 94ca15bb (2026-07-01). Its own
  comment says the structured-map gate began as a Babylon-vs-WebGPU comparison
  against campaign-3d.png, then became absolute floors for substantial sea,
  land, roads, labels and absence of political wash. The code provides no
  per-name inventory, contrast criterion, or documented derivation of .002.
  I did not establish the original earlier migration experiment's calibration.
- 2e06d5b2 changes the regional pose from (-430,380,4) to (-430,445,3) for the
  real camera, explicitly retaining floors. Historical PNGs at these commits
  are therefore different framings, not matched appearance controls.
- 99da9f03 explicitly moves own-city/army coverage checks from canvas labels
  to DOM cards. It preserves/strengthens the named Roma/Ostia close-view
  contract, but leaves the whole-frame .002 test unchanged.
- The implementation counts all alpha>=16 pixels below y36, independently
  increments label when r>205 && g>205 && b>185, and divides by total pixels.
  It rounds the ratio to four decimals BEFORE comparing >=.002. Thus the
  effective minimum here is 1907/977920 (rounds to .002), not the strict raw
  fraction's 1956 pixels. Earlier UI audit's 1956/933-shortfall wording was
  the strict mathematical floor, not the exact rounded implementation;
  this correction does not change any observed pass/fail.

## Retained PNG measurements

Exact original RGB predicate, all 1280x800, denominator977920:

| Capture | White pixels | Raw fraction | Existing gate |
| --- | ---: | ---: | --- |
| 94ca15bb introduction | 5922 | .00605571 | pass |
| 2e06d5b2 real camera | 3892 | .00397988 | pass |
| 99da9f03 DOM-card architecture | 3143 | .00321396 | pass |
| c87418b5 latest legacy canonical | 2956 | .00302274 | pass |
| current painted-bounds candidate, root retained image | 1019 | .00104201 | fail |

Historical PNGs were extracted from git; counts.json records their measurements.
The latest legacy frame and inspected crops are retained here; earlier frames
remain reproducible from the named commits. No canonical image was edited.

**Decisive CPU missing-neutral-name counterexample:** seven generous rectangles enclose
all visible neutral-city names in the latest legacy canonical (Spoletium,
Aternum, Corfinium, Larinum, Aesernia, Beneventum, Puteoli). I inspected the
3x crop montage to verify every name is fully enclosed. Ignoring all pixels
in those rectangles removes761 white pixels. The remaining2195 pixels give
.00224456 and STILL PASS. Those rectangles also remove some road/body pixels,
so this is a conservative exclusion. It is arithmetic on an unchanged PNG,
not an actual hidden-label render. It proves the scalar can be satisfied
without any white contribution from these seven essential canvas names.
A separately inspected bare-road crop (x650,y300,w130,h50) contains30 pixels
that the same predicate calls labels; its sample RGB includes214,208,191.
A further disjoint conservative region audit separates the2956 pixels into
761 neutral-name regions,943 generous manually identified DOM-card regions,
3 top-HUD pixels and1249 outside those regions. The943 card-region pixels
include legitimate own-city titles, income/garrison/coin/frame content and
possibly adjacent scenery; they are NOT classified as non-label noise.
The1249 residual includes road/body/other scene pixels, but has not been
semantically attributed pixel-by-pixel. These manual legacy regions are not
live DOM title rectangles. Therefore the scoped proof is: the gate still
passes when every visible neutral canvas name contributes nothing, because
DOM-card and other surfaces together carry its margin. It does not show a
pass with ALL readable names absent.

Previous matched production output evidence also establishes:
- Before UI correction134 white pixels; after1023, of which889 lie in actual
  reported label inkRects,131 in DOM-card boxes,3 in top HUD,0 elsewhere.
- All12 reported city labels have opacity1. Seven are visible; four offscreen;
  Populonium is behind the top HUD. Visible peaks242–244/239–240/232–233.
- Named city/card geometry is unchanged and regional pixels outside canvas-label boxes are
  identical across that isolated UI correction. Fresh critique reports
  improved readable names, not missing ones.
- Current root painted-bounds report preserves the same12 label names and
  same7 visible names;18/19 checks pass and only the white floor fails.
  Its1019 white pixels are separately measured here; do not substitute the
  UI-only1023 image or metadata as an exact current measurement.

## Why DOM titles are not comparable by this scalar

MapCards.tsx emits .cmp-map-card__name separately from income/coin/garrison.
The title CSS uses --bronze-ink-bright:#f8e6bc (248,230,188), while neutral
canvas names are near(248,244,237). A full-coverage DOM title pixel can qualify,
but its blue channel is only3 levels above the strict185 cutoff, so normal
edge antialiasing readily excludes it. The canvas title has much more blue
headroom. The oracle does not distinguish a city name from its coin, income,
road, or model highlight, nor count individual represented settlements.
The131 card-box whites are NOT proven to be title whites: the prior audit
measured full card boxes, not .cmp-map-card__name rectangles.

## Inferences and unresolved behavior

Supported inference: the old passing margin did not require contributions
from the neutral canvas-name owner. Legitimate own-city DOM titles plus other
bright surfaces could carry it, so the global red after physical rendering
cannot establish that neutral or own-city names disappeared. This is an invalid proxy for name completeness and
per-name readability across the two owners, though it remains an accurately
implemented global brightness metric.
Not proven: every expected visible settlement has a readable title, all
DOM titles remain untruncated, or association/halo issues are resolved.
Alpine near-touching names and edge/HUD clipping are real separately measured
issues. A passing brightness total could never rule them out.

## Smallest decisive live follow-up

One frozen current regional world at the exact original sequence/pose/DPR,
with the production camera and time held fixed:
1. Normal frame: retain expected city inventory from map/ownership+projection,
   actual visible canvas text/opacity/painted bounds, DOM title text and its
   own getBoundingClientRect/computed style (not whole-card bounds), and
   per-name crops. Verify expected names across BOTH owners and inspect
   clipping/association/ink contrast in those crops.
2. Same frame with the existing canvas-label mesh temporarily hidden for a
   direct fixed-frame draw, then restore it; terrain and DOM layout unchanged.
3. Same frame with only DOM .cmp-map-card__name text hidden via visibility
   (retain layout), then restore. Preserve income/garrison separately.

This is a bounded diagnostic, not a new production knob. First inspect the
owner to ensure its normal update cannot overwrite the visibility control.
The owner-specific image differences identify actual text contributions and
prove that any proposed name-readability oracle rejects both missing-owner
controls while keeping geometry/world pixels fixed. The current whole-frame
white test is already red on the normal frame, so merely showing it stays
red on negative controls is NOT validation. No additional landscape/zoom
sweep, font change, threshold adjustment, or baseline repin is needed for this
decision. The CPU counterexample is already sufficient to show the old scalar
cannot guarantee neutral-name completeness; the live control is for establishing
an alternative owner-aware contract rather than excusing the current failure.

## Replacement-contract recommendation (proposal only)

Preserve the structured-map sea/land/road/political-wash checks. Replace the
white-coverage subcondition only through an explicit behavior ledger, with:
- content coverage keyed to the expected visible city inventory, accepting
  exactly one readable representation from canvas labels or DOM titles for
  each city; preserve the existing named Roma/Ostia and same-frame contracts;
- per-owner actual painted/title bounds, frame/HUD visibility and measured
  text contribution/contrast, rather than a whole-frame white fraction;
- the normal positive frame plus missing-canvas and missing-DOM-title real
  rendered negative controls, each of which MUST fail the corresponding
  content/readability condition; include a faded/low-contrast negative only
  if adopting a numeric contrast measure, to prevent presence-only checks;
- existing spacing/halo occupancy checks remain independent (a high-contrast
  pair can still run together).

No numeric contrast threshold is proposed from a convenient passing pixel
count. Ground it in readable current and historical crops plus actual negative
controls, and obtain a fresh visual verdict before accepting it. Mere counts
of names or rendered rectangles are insufficient, because offscreen/HUD-hidden
labels already prove those counts can overstate visible content.
