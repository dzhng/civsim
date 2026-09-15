# Remaining-map first-pass audit

This read-only pass preserves the [original report](../remaining-first.json), all
[17 actual captures](captures/) and focused [label comparisons](crops/). It ran
at `595d5762` with the same matching WASM and patched Three described in the parent
provenance. No production or harness code, threshold, or baseline changed here.

The report has 22 failures: 17 old-image differences and five behavioral failures.
There are no page errors. Collision ordering/overlap, both frame corners,
semantic and visible land/water alignment, road continuity, LOD state/density,
selection/garrison state and the existing own-card/model checks pass. This does
not accept the images: the label and Tibur regressions below require correction.

## Screen-label atmosphere

The regional-natural label floor remains 0.002; observed 0.0001. Other structural
floors pass. The source painter uses near-white ink, but Corfinium, Spoletium and
Aesernia glyph highlights peak almost identically around RGB (198,196,191). No pixel
inside their expanded current label boxes meets the existing white predicate.

Fresh unprimed review finds comparison A (legacy) more readable than B (physical)
in all three pairs: the dark outline separates letters from pale roads and
variable terrain. B's Aesernia blends into the road; its other names lose edge
contrast. Both full maps and crops were inspected directly.

The physical screen-label material inherits Three's enabled atmosphere hook,
although its vertices are in screen coordinates. The environment installs that
hook for world materials; the battle readout explicitly disables it. This is a
concrete source-level hypothesis for the contrast regression. A label-material
atmosphere-off control is required before changing the white-pixel gate. Disabling
campaign fog-of-war in the fixture does not disable atmospheric scattering.

Reproduction: normal new campaign, 1280x800, DPR1, Day1 without ticks; freeze(true),
factionView(false),fogOfWar(false),select(-1),cam(-430,445,3),then the existing
presentation-readiness helper. This is the regional-natural stop in campaign-lod.
Current ink boxes are Corfinium [861.454,343.288,83,20],
Spoletium [600.562,139.765,80,20],Aesernia [967.99,522.552,68,20]. The saved report
has projected label/body rectangles rather than a live actual-camera object.

## Tibur collision cascade

The border-fog capture newly displaces Tibur's card into open sea. The legacy
baseline keeps it immediately under its city. The [captured body/card data](tibur-border-fog.json)
and [reconstruction](tibur-cascade.json) isolate the current downward packing:

| Stage | Card top, CSS pixels | Obstacles |
|---|---:|---|
| Desired |258.796|City body bottom248.876 plus existing9.92 offset|
| First displacement |352.863|Roma|
| Second displacement |394.863|Ferentinum and Ostia/Portus|
| Third displacement |458.481|Tarracina|

The reconstructed final top matches the captured double exactly, with 199.684
pixels of displacement. Tibur's x remains 598.738 and its card remains 82x38.
Card obstacles alone explain the full cascade; no anchor obstacle is needed in
this reconstruction. A live stage-by-stage trace has not been taken.

The owning loop is layoutMapCards in the campaign scene: tier/source order claims
rectangles, then full-tilt city cards move only downward until free. Preserve its
same-frame reporting, model-anchor clearance and all-own-cities-visible contract.
Do not hide Tibur or introduce a one-city exception. A general ordering or packing
correction needs its own focused reproduction and review.

Exact failing stop: same campaign after opening Roma's city panel,
fogOfWar(true),factionView(true),cam(-430,380,2.2),1280x800,DPR1,paused Day1. Tibur
is dense node 348, world(-430.1202891406224,452.8759700166664).

## Color and cart verification owners

The old green-leading RGB predicates reject the supplied target's yellow grass.
A read-only [transfer measurement](ground-transfer.json) applies the already
reference-validated yellow-olive classifier without changing LOD exclusions,
denominators or floors. Named mixed crops become 0.7409/0.6620/0.6067 against 0.55;
Rome close and selected army become 0.7979/0.7960 against 0.42. Mountain and dark
feature ratios remain unchanged and already pass. A shared classifier owner can
replace the duplicate predicates; copying the private function into LOD would
create another calibration to maintain. No terrain material tint is justified.

The road-life failure reads the retired sceneryStats.carts field. The physical
owner supplies sceneryAnchors with kind="cart"; the alignment-route report
contains two such anchors. The road image visibly contains carts and unchanged
continuity gates pass: ratios 0.882/0.875/0.857, maxGap 2,all destinations reached.
Retire the stale diagnostic lookup while retaining the presence requirement.

The unprimed reviewer also flags rectangular political-wash patches and clipped
label/card fragments near overlays and edges. Their migration provenance remains
unclassified; they are not recorded as new defects here.

[The atmosphere-only label control](../label-fog-control/README.md) confirms a
partial outline improvement with exact repeat, while the original brightness
gate remains red. It also identifies the global WebGPU tone-map boundary for
the next isolated diagnostic.
