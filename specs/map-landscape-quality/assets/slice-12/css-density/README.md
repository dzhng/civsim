# Campaign density follows CSS zoom

The same camera must choose the same scenery, figures, cards and label sizes on
standard and high-density displays. Backing-pixel projection remains intact;
visibility and interaction policy consume CSS zoom. Implicit label cameras also
supply backing zoom, so normalization happens once for either caller path.

The [matched control](control.json) fails seven policy checks: DPR2 adds labels,
cards and forests at the same framing, and drags half the intended distance.
The corrected run passes and its [independent repeat](repeat.json) matches all
six snapshots at zero pixel tolerance. Real Aguntum selection still uses a fixed
reviewed pixel. A temporarily marching Roman army makes the regional figure
membership assertion nonempty; it returns to Rome before the selection checks.

[Before overview](before-overview-dpr2.png) and [before regional](before-regional-dpr2.png)
show the old DPR2 policy. Current frames are the canonical
[overview](../../../../../web/shots/campaign/campaign-density-overview-dpr2.png)
and [regional](../../../../../web/shots/campaign/campaign-density-regional-dpr2.png).
[Pixel measurements](pixels.json) show DPR1 remains identical, while DPR2 removes
the unintended density. The Aguntum DPR2 image changes only three HUD pixels by
one channel level after the extended scene flow; that image repeats exactly.
No tolerance was added.

Independent visual review finds matching framing, card positions, label sets,
apparent CSS sizes and tree placement across densities, with no new visible
collisions or road discontinuities. Large faction text and a bottom-edge card
remain composition issues at both densities. This is display consistency evidence,
not acceptance of the remaining landscape art or the full interaction matrix.

Focused CPU tests pass (17 cases). The review caught an implicit-label-camera
caller that would otherwise normalize zoom twice; the real render-boundary test
now pins that path. Existing atmosphere checks remain enforced.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| campaignCameraDpr, CSS zoom 2.5 | Camera equality only; DPR2 pan speed half | Also requires equal pan speed | Keyboard speed uses CSS zoom. **moved** |
| campaignCameraDpr, CSS zoom 7.5 | Camera equality only; DPR2 pan speed half | Also requires equal pan speed | Same contract at close camera. **moved** |
| campaignAtmosphere, frame boundary | Three atmosphere samples | Four samples and equal implicit CSS label zoom at DPR1/2 | Fixes caller units found during review. **your-regression** |
| campaignLabelProjection, raised labels | Fixture zoom 2 at DPR2 | Backing zoom 4 at DPR2; projection assertions unchanged | Fixture now obeys the camera contract. **moved** |
| label CSS policy, zooms .3/.4/.59/.6/.84/.85/.96/2.5 (eight cases) | No cross-density policy gate | Equal visible names, size, opacity and CSS anchors | Exercises visibility thresholds; old implementation fails. **moved** |
| label overscan, DPR1 | No edge gate | -150 CSS px retained; -190 rejected | Pins existing 180 px margin. **moved** |
| label overscan, DPR2 | Backing margin halved in CSS space | Same -150/-190 outcome | Margin now scales with backing dimensions. **moved** |
| interaction, overview | No density-policy gate; control labels23→56 and scenery0→29096 | Equal label/scenery/card/figure membership | Compare the same world view. **moved** |
| interaction, city tiers | No density-policy gate; control cards1→3 and labels24→123 | Equal membership | CSS city-tier thresholds. **moved** |
| interaction, regional | No density-policy gate; control labels12→9 and scenery390→995 | Equal membership; cards16, figures2, labels12, scenery390 | Exercises nonempty real scene consumers. **moved** |
| interaction, CSS drag | No density drag gate; DPR2 moves half distance | Both densities move [-13.3333,6.6667] | CSS input delta uses CSS zoom. **moved** |
| density overview DPR1 snapshot | No baseline | New exact snapshot | Pins standard-density control. **moved** |
| density overview DPR2 snapshot | No baseline | New exact snapshot | Pins corrected density. **moved** |
| density regional DPR1 snapshot | No baseline | New exact snapshot | Pins standard-density close view. **moved** |
| density regional DPR2 snapshot | No baseline | New exact snapshot | Pins corrected close view. **moved** |
| Aguntum DPR2 snapshot | Earlier flow HUD raster | Three one-level HUD pixel changes, repeated exactly | Extended policy-view flow; world composition unchanged. **moved** |

Aguntum DPR1 remains byte-equivalent in pixels; neither its fixed-click assertion
nor the DPR2 selection assertion was weakened. No simulation or stat changes.
