# Controlled campaign acceptance

This checkpoint separates source and interaction correctness from final landscape
quality. Synthetic stage bitmaps encode map classes; terrain moisture and the
shared physical material own the displayed natural color. Painting an arbitrary
green into that class map accidentally generated mountains.

## Source diagnosis

The first canonical SwiftShader pass reached all ten controlled captures without
page errors. Its existing green-ground check measured 5.32% green against an 88%
floor. The fixture's nominal RGB `(154,170,104)` was closer to the mountain palette
entry than ordinary land; its art noise crossed that class boundary. The generated
bitmap/classifier regression observed `[mountain, land]` before the correction and
only lowland afterward for both controlled and handoff stages.

The fixture now fills the existing canonical land class and leaves natural color
to the existing material. [Before-source frames](before/) preserve the excessive
relief. The corrected source removes those hills; the second capture measured
14.98% under the old green predicate. No production geography, material, simulation,
seed, save, or command changed. The handoff fixture shares this source correction
and requires its owning journey to repeat after integration.

## Color oracle

[Measured crops](green-classifier.json) show why the old RGB predicate no longer
expresses the supplied target. It accepts 100% of the prior artificial swatch but
calls 99.98% of the reference's bare yellow grass brown; adjacent reference olive
grass passes at 91.94% green. The two inspected bare reference crops span hue
48–71 degrees. The other natural reference also fails the old predicate, though
those additional crops include vegetation/shadow and a path edge and therefore
serve only as supporting context.

The color gate retains 88% coverage and a 5% wrong-soil cap. It tests yellow-to-olive
hue with a small lighting allowance, and enough chroma to exclude neutral stone.
Pinned RGB samples from both reference patches are positive controls; blue water,
neutral gray rock and red-brown soil are negative controls. Full patch coverage is
retained in this evidence, so moving the spec cannot break a canonical scene. This is a color-presence check, not a measure
of reference-level material variation or saturation. All patch pixels count,
including black/transparent missing content.

The photographed ground sample is a fixed world patch south of the road and west
of the nearby tree, projected using the presented surface. Its bounds and sample
count must remain valid. A fixed screen crop would include the road after the
source elevation correction. The original screenshot camera and full-frame
snapshot remain unchanged.

## Review boundary

An unprimed reviewer inspected all ten corrected-source frames and focused crops.
Labels remain separated, including the army/neutral-city stack; controls and icons
are legible. No definite detached flag, missing field army or inverted occlusion
was found. The current natural hue is plausible.

Final landscape quality remains open: the ground looks uniformly mottled, the
road is a pale regular ribbon, and large mint selection rings dominate the small
fixture. Army silhouettes against roofs and tree contact shadows merit further
quality review. The class-builder's clipped next row lacks an obvious scroll cue.
These findings belong to the existing material, geographic, entity and whole-game
quality slices; this checkpoint does not claim the reference bar is met.

Shape review removed the obsolete fixture art-noise path and reused the canonical
palette. Independent Codex reviews found no actionable source or oracle defects;
the second review exercised the fixture regression and color controls. Focused
fixture/runner tests and TypeScript pass. The [final browser run](controlled-final.json)
passes all 21 checks. Its projected ground patch contains 13,573 pixels, with
100% yellow-olive and 0% red-brown. All ten images [repeat exactly](exact-repeat.json)
against the previously reviewed corrected-source capture. The canonical images
under `web/shots/campaign/` and `web/shots/ui/` are accepted for this bounded
source/interaction checkpoint, not the full reference quality bar.

Root review then removed the scene's runtime dependency on the active spec image:
the two actual reference RGB samples preserve small permanent controls, while full
reference-crop coverage stays in the evidence. CPU controls were rechecked after
that change; it does not alter the displayed state. [Provenance](provenance.json)
records the fixed adapter, WASM identity and dependency patch boundary.

## CHANGE LEDGER

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| controlled fixture source regression | Actual synthetic bitmap classified as mountains and land. | Both controlled and handoff bitmaps classify as lowland throughout. | Arbitrary green artwork was incorrectly used as geographic class data. **carried-in** |
| polish natural-ground color | Green-leading RGB over a fixed screen rectangle; 88% green, at most 5% brown. Corrected source measured 14.98% green; reference yellow grass measured 99.98% brown. | Fixed world-ground patch; 88% yellow-olive and at most 5% red-brown, with reference positives and water/stone/soil negatives. Browser result: 100% yellow-olive, 0% red-brown. | The old predicate rejected the supplied target and its crop moved onto the road when relief was corrected. **moved** |
| tiny-overview snapshot | Raw world with art-colored class input. | Physical lowland stage, visible city cards and labels. | Renderer migration plus corrected source; exact repeat 0 px. **moved** |
| ui-class-builder snapshot | Class-builder over the raw world. | Same panel flow over physical lowland terrain. | Production owner changed; exact repeat 0 px. **moved** |
| ui-diplomacy snapshot | Diplomacy panel over the raw world. | Same panel and faction content over physical lowland terrain. | Production owner changed; exact repeat 0 px. **moved** |
| ui-city-panel snapshot | Selected-city panel on the raw stage. | Same city controls on physical lowland terrain. | Production owner changed; exact repeat 0 px. **moved** |
| ui-army-replenish-toggle snapshot | Selected-army controls on the raw stage. | Physical stage with the already integrated one-row replenish control. | Production owner and previously reviewed UI correction; exact repeat 0 px. **moved** |
| tiny-army-our-city snapshot | Garrison pose on the raw stage. | Same garrison pose, card composition and selection on physical lowland terrain. | Production owner changed; exact repeat 0 px. **moved** |
| tiny-army-road snapshot | Field-army pose on the raw stage. | Same road pose and controls with physical army figures and terrain. | Production owner changed; exact repeat 0 px. **moved** |
| tiny-army-neutral-city snapshot | Army at neutral city on the raw stage. | Same pose with separate army card and neutral-city label. | Production owner changed; exact repeat 0 px. **moved** |
| polish-label-spacing snapshot | Raw city/card/army spacing on art-colored terrain. | Physical lowland source with readable separated labels and cards. | Renderer migration and source correction; exact repeat 0 px. **moved** |
| polish-green-swatch snapshot | Directly painted green stage with off-map void. | Shared physical yellow-olive terrain and source-owned coastline. | Renderer migration and source correction; exact repeat 0 px. **moved** |

The first and corrected-source reports retain every unchanged assertion and
snapshot failure. No collision same-frame assertion or screenshot tolerance was
changed. The remaining map-alignment, roads, frame, collision and LOD captures
have not yet run in this pass.
