# Campaign entity-frame checkpoint

The physical campaign world consumes one entity frame. Cities, crowd, standards
and selection come from the existing campaign frame builder rather than separate
public setters or reconstruction from generic model objects. The frame owns
identity, allegiance and authoritative selected state; rendering alone does not
reset a later selection. Settlement and garrison standards retain their city
identity so the existing presented foundation moves the pole with its building.

Campaign selection now shares its CPU annulus and normalized style with the raw
pass. The physical layer applies that same city/army/garrison profile as a
transparent depth-reading ground cue. The established ellipse, band widths and
color strength are preserved; this is not a new selection design.

Road carts use the existing scenery layer and cart mesh. Their source elevation
and presented elevation remain distinct: a surface-relative clearance carries
the existing road ribbon's lift, so a terrain replacement does not bury wheels
beneath the road or multiply the clearance by model scale. No road dimensions,
cart dimensions, geography, commands or simulation rules changed.

## Garrison composition decision

Fresh inspection exposed representative soldiers intersecting city roofs. A
garrison now uses its city and garrison standard, selection and card, without
representative crowd figures. This is a deliberate presentation change in the
existing frame policy. The garrison display anchor stays fixed because labels
and marker ownership share it. Moving only physical figures would introduce a
second placement owner. Field-army representatives and troop data are unchanged.

The established mint ring remains conspicuous at close inspection. The critique
identified that as a readability limitation, and this pass preserves its source
style rather than redesigning selection.

## Evidence

The [scene](../../../../web/scenes/campaign/campaign-entity-inputs.mjs) feeds actual
frame and road-cart outputs to the physical world. The
[coarse frame](../../../../web/shots/campaign/campaign-entity-inputs-coarse.png),
[replacement terrain](../../../../web/shots/campaign/campaign-entity-inputs-raised.png)
and [cart inspection](../../../../web/shots/campaign/campaign-entity-inputs-cart.png)
are native SwiftShader snapshots at 1280×800 DPR1. The first two use the fixed
campaign camera; the third moves that camera closer to an actual forward-road
cart so its wheel contact is inspectable. A rear-cart camera hidden behind the
fixture ridge was rejected during inspection. Pointer position is fixed so a
hovered fixture button cannot disguise snapshot determinism.

All three final snapshots repeated with zero differing pixels. A fresh final
critic found no blocking defects: coherent garrison buildings/banner, grounded
field army, continuous rings and cart wheels meeting the road. Cart wheel shape
remains soft at the source pixel size; the closer frame supports contact and
overall readability. The [garrison before crop](garrison-before.png) and
[final crop](cart-garrison.png) retain the corrected overlap; [telemetry](comparison.json)
records the visible change rather than treating similarity as acceptance.

Input removal and return, faction/standard identity, selected-army replacement,
garrison selection, cart motion, fog-query changes, terrain replacement and
world recreation are covered. The earlier isolated crowd snapshots remain
unchanged. This is entity presentation evidence; production adapter, overview
screen markers, interaction and DPR2 acceptance remain with their own passes.

## Review and change ledger

Independent code review found missing initial cached standards and loss of city
foundation height when seating incoming banners. Both were fixed at their owners.
No asset or dependency symlink is part of this change.

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| garrison frame / campaignPresentation | Occupied-city stack produced representative figures intersecting roofs | City, selected garrison standard and garrison ring remain; field crowd equals the no-city control; troop input unchanged | Deliberate frame-policy presentation change (moved) |
| cart submission / campaignPresentation | Existing scenery bucket omitted cart inputs; red control submits zero | Existing cart asset submits, keeps pose and clears on removal | Shared layer now admits its actual cart consumer (new coverage) |
| cart road clearance / campaignPresentation | Wheels began at terrain below the elevated ribbon | Source height includes road lift, retained separately for physical reseating; fog still removes carts | Correct wheel/road contact (new coverage) |
| selection geometry and disposal / campaignPresentation | No physical shared-profile coverage | Ellipse vertices follow terrain; replacement clears stale rings; disposal releases mesh | One profile and geometry owner across substrates (new coverage) |
| campaign-entity-inputs | No combined physical frame fixture | Real city/garrison/field standards, selection and carts, with terrain/visibility/lifecycle checks and three snapshots | Shared frame adoption (new coverage) |

Existing test assertions and pins otherwise remain unchanged. Fifty-two focused campaign,
city, scenery, standard and crowd tests and typecheck passed. The garrison and
cart admission tests each fail when their corresponding presentation fix is
removed, then pass when it is restored.
