# Live city input and grounding checkpoint

Cities now consume the existing campaign entity frame in the physical campaign
world. City identity, label, selection radius, ownership and allegiance travel
with that frame; the raw GPU pass imports the shared instance contract instead
of owning it. This checkpoint does not migrate the army crowd, carts, accepted
label layout or production scene adapter.

The existing city asset owns its buildings. Each roof remains horizontal above
its footprint; the existing walls extend below the footprint's sampled minimum,
with an extra authored wall height of buried foundation. The presented terrain
therefore determines the visible contact line even across local troughs. City
XY, authored horizontal footprint, terrain geometry and water are unchanged.
The default asset's opaque and shadow vertices and indices are byte-identical
to the parent. Tile replacement re-seats only intersecting city/model-contact
bounds. Ownership/selection-only updates reuse the current geometry.

The asset's existing contact shadow is a surface-seated, depth-read decal. It
is a contact cue, not new sun-shadow artwork or a fix for the map-wide sun
shadow camera. Fog visibility and disposal inherit the city mesh lifecycle.
The settlement standard keeps its shared scale and appearance owner, translates
with its central building, and uses city identity for stable cloth variation.

## Comparison

Target: complete solid buildings touching the presented terrain, with horizontal
roofs and unchanged geographic positions. The control uses the same live inputs,
terrain, contact cues, camera, viewport and clock, but retains center-only flat
city seating. It is an isolated grounding control, not a claim that the old
composition already supported live cities. The control was captured by temporarily
removing the optional grounding callback, then restoring the source; no backend
switch remains.

The four `*-center.png` controls compare with the final regression images under
[web/shots/campaign](../../../../web/shots/campaign). The enlarged final crops
and [pixel telemetry](comparison.json) expose the contact regions. The candidate
is less wrong: the steep fixture retains its uphill buildings and supports its
downhill wall edges instead of burying and suspending sections of one flat cluster.
The real-site differences are smaller, particularly on the coastal plains.

## Verification and boundaries

The `campaign-city-grounding` scene covers the tiny fixture and actual live-frame
Perge/Attalea, Cyrene/Apollonia-Sozousa and Scodra. It verifies an independent body-pixel click, fog clearing hidden selection, city
removal, reinsertion and selection, plus clean GPU execution. Four hardware Chrome
captures repeat at zero differing pixels, at 1280×800 and DPR1. The focused
campaign/surface CPU run has 34 passing tests; main and lab typechecks pass.

Independent code review identified the initial corner-only wall grounding as
insufficient across a depression. Buried wall foundations replace that approach,
and a non-planar edge regression pins it. No shared MeshBuilder change remains.
Fresh full-frame and enlarged-crop review found no blocking city geometry or
standard-attachment defect. It retained three limitations: weak regional sun
shadows belong to environment/view fitting; Attalea's preserved outer footprint
reaches the coast; the existing selection ring is heavy and reads as a tall
outline on the steep fixture. The final fresh review also noted tall downhill
retaining walls in the deliberately steep fixture and weak separation between
the asset’s overlapping roof blocks; no floating city, open wall/roof gap,
detached standard or terrain slicing through roofs was visible. Full-map city
draw cost is not accepted by this close-site pass. This pass does not hide those limits with terrain
pads, relocation, lighting changes or a new selection style.

## New behavior coverage

No existing CPU assertion or screenshot baseline was re-pinned by this pass.
The new `campaignCityLayer` tests cover wall bases after surface replacement,
ownership/selection updates without geometry churn, removal/disposal, wall edges
across a trough, and the authored depth-read contact cue after replacement.
The new screenshot scene and four baselines pin the live city checkpoint.
