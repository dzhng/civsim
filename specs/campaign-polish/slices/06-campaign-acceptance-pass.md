# Campaign Acceptance Pass

## Contract

Campaign polish is accepted by focused evidence: the feedback screenshots are
addressed, the old renderer's strengths are preserved, and WebGPU is visibly
better where it diverges. This pass does not replace the slice-level workbench
checks; it confirms the independently accepted pieces still work together in
the real campaign.

## API Seam

- `web/scenes/campaign/campaign-lod.mjs`
- screenshot regression harness under `web/`
- screenshot critique and compare-screenshots skills for visual review
- slice workbench outputs for roads, labels, terrain color, terrain relief,
  forests, and road-life props

## Human Review

Review the final contact sheet/crops for close Rome, central Italy natural,
central Italy faction view, mountain/forest crop, road-life crop, and fog crop.
Also review the accepted workbench outputs so regressions in the small seams do
not get hidden by the busy campaign map.

## Verification

- Run the campaign WebGPU scene bundle.
- Confirm every prior slice has a recorded screenshot-critique result.
- Run one final screenshot critique with cropped focus on labels, roads,
  mountains, forests, terrain color, and road-life props.
- Record accepted crops in this spec, not broad temporary report folders.
- Verify that no generated report folders or broad temporary image dumps were
  added to the spec.

## Status (2026-06-29)

Done. The full campaign WebGPU scene bundle (`campaign-lod`,
`campaign-polish-roads`, `campaign-polish-markers`, `campaign-visual`,
`campaign-map-alignment`) is green — 38 checks, 0 failures — so the five
independently-accepted slices hold together in the real campaign. A final
unbiased `screenshot-critique` (fresh agent, no project context, judging the full
acceptance views plus tight crops) returned GOOD on label spacing, Ostia/Portus
label+road, road continuity, terrain green, forests, carts, and fog; it raised
one flag (Apennine cities reading as "embedded" in the mountains) addressed
below.

Durable accepted crops are recorded under
[`assets/acceptance/`](../assets/acceptance/) (seven curated crops — no report
folders or temporary dumps added to the spec).

### Before / after vs the four feedback images

- **[01 Rome/Ostia label + road](../assets/user-feedback/01-rome-ostia-label-road.png)**
  → [after](../assets/acceptance/01-ostia-label-road.png). *Before:* the coastal
  Ostia/Portus risked losing its label and its road. *After:* the Ostia/Portus
  label is crisp and sits ~one icon-height under its model, and the road from
  Roma arrives into the city footprint. The `campaign-polish-roads` workbench
  gates on `city:OSTIA/PORTUS` staying a visible label and on the Roma→Ostia
  spoke painting unbroken; both pass.
- **[02 Tibur label distance](../assets/user-feedback/02-city-label-distance-tibur.png)**
  → [after](../assets/acceptance/02-tibur-label-spacing.png). *Before:* labels
  floated far from their icons. *After:* relief-aware `cityLabelOffset` /
  `cityReliefRisePx` (slice 2) seat every label about one icon-height from its
  model; `polish-label-spacing` baseline blessed and critique-confirmed.
- **[03 Mountains/roads/trees](../assets/user-feedback/03-mountains-roads-trees.png)**
  → [after](../assets/acceptance/03-apennines-mountains-forest.png). *Before:*
  chunky repeated cones, no forests, a city in the mountain mass. *After:* broad
  multi-hump massifs with per-instance yaw (slice 4), visible forests in wet
  regions, and city icons that stay legible at the range. (See the mountain note
  below for the residual.)
- **[04 Rome south road cutoff](../assets/user-feedback/04-rome-south-road-cutoff.png)**
  → [after](../assets/acceptance/04-rome-south-road-continuity.png). *Before:* a
  road leaving Rome vanished before the next city. *After:* every spoke paints
  unbroken from Roma into the destination footprint; the road-continuity probe
  (maxGap ≤ 3 samples, hitRatio ≥ 0.85, reachesCity) passes on all spokes and on
  the real-map `CENTRAL_ITALY_ROAD_PAIRS` including Roma→Ostia/Portus.

New since the feedback set: **carts**
([after](../assets/acceptance/05-carts-on-roads.png)) ride the roads as small,
correctly-oriented, on-centerline props (slice 5), and **natural ground**
([after](../assets/acceptance/06-natural-green.png)) reads green, not brown
(slice 3).

### Critique flag: Apennine city/mountain reading — RESOLVED (2026-06-30)

The slice-6 critic flagged Asculum, Alba Fucens, and Corfinium as "embedded" in
the mountains: each icon was legible but sat on a cleared tan apron *inside* a
large bare-brown massif, so a zero-context viewer read the towns as in the
mountains. The recorded candidate polish was to *widen the green apron / break up
the large bare massif*.

This was done by giving the terrain-height grading a vote it never had. Slice 4
cleared mountain *props* around cities but left the *heightfield* under them
untouched — and since both the rock color (`rock = f(height)`,
`mapPass.ts`/`terrain.ts`) and mountain-prop spawn read off height, the cleared
zone stayed painted bare brown with no relief: a flat-looking massif the towns sat
on. The fix carves a lowland apron into the relief around every real-map city
after grading (`web/src/campaign/terrain.ts`, the city-aware clearance block):
within ~12 km a town's ground returns to lowland, ramping back to full massif
height by ~34 km. Lowering height is the single source that also de-rocks the
color to green and thins props near the town, so each hill-town now gets a green
foot while the massif still rises in the gap between towns. Scoped to the real
map (`!controlledStage`) so the synthetic fixture stages are not reshaped.

Before / after at identical framing:
[before](../assets/acceptance/03c-hilltown-apron-before.png) (Alba Fucens /
Corfinium on the bare brown lobe) →
[after](../assets/acceptance/03c-hilltown-apron-after.png) (both towns on green,
the brown massif reduced to a compact prop cluster below them). A fresh unbiased
critique of the after-state confirms the towns now read as "standing on clear
ground, not embedded." The earlier
[03b](../assets/acceptance/03b-hilltown-clearance.png) crop is the pre-polish
state. `campaign-lod` named mountain/forest crops still pass (mountains are pulled
back, not erased); all nine real-map `campaign-lod` baselines re-blessed.

Residual terrain-art note (unchanged by this pass, lower priority): the
multi-hump mountain *mesh* still reads somewhat flat at the top-down regional
zoom. The prior slice-4 critique accepted that mesh ("geological, not geometric");
improving its silhouette/material at shallow camera angles is a separate
terrain-art item, no longer entangled with city readability.

The faction-overlay "tint shift" the critic noted is the intended political wash
(owner-tinted terrain + green faction icons); the natural vs political pair share
identical road/city/cart/coast geometry, so the overlay is a clean wash, not a
distortion.

### Slice critique ledger

- Slice 2 (labels/road): unbiased critique — net improvement, accepted.
- Slice 3 (terrain green): "anemic/flat" → "ship with confidence."
- Slice 4 (landforms/forests/clearance): "decisive improvement, geological not
  geometric"; forests "definitely forested."
- Slice 5 (carts): unanimous HIGH-confidence positive.
- Slice 6 (this pass): GOOD across all dimensions; one non-blocking flag
  documented above.

## Done

- [x] All starting feedback images have explicit before/after notes.
- [x] No active blocker remains for label spacing, Ostia/Portus road/label,
  Rome south road continuity, natural terrain color, mountains, trees, or road
  life. (One non-blocking future-polish note recorded: the large bare massif
  behind Alba Fucens–Corfinium; cities stay legible at the mountain foot.)
- [x] Every slice has passed an unbiased screenshot critique with full images and
  tight crops.
- [x] Workbench outputs and real campaign outputs both pass (38 checks, 0 fails).
- [x] The spec links only durable review evidence (`assets/acceptance/`, seven
  curated crops; no report folders or temporary dumps).
