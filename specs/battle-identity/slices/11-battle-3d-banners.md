# Slice 11 — battle: the standard leaves the DOM

**Contract:** each unit's flag is the slice-10 3D standard planted in the
ranks — in-scene, depth-tested, lit, cloth waving — replacing the SVG flag
inside UnitBanner (unitBanner.ts:48-81). The DOM component temporarily keeps
bars + chips bottom-anchored at the projected pole-top (scene.ts:475
updateUnitBanners) so this slice stays reviewable on the flag alone; the
readout migrates to in-scene GPU billboards in slice 12, which retires the
DOM banner entirely. Distance behavior like Total War:
the standard scales with the world but never shrinks below a legible
floor at tactical zoom (mirror the campaign figure-LOD idea, not a fixed
screen-space sprite).

Selection must still read on the flag itself (the "flag glow" contract):
move the .sel treatment to the 3D standard (emissive/rim lift), not a DOM
halo floating where the SVG used to be.

**Verify:** banner gallery (?test=banners) narrows to the DOM remainder
(bars/chips) — re-bless, knowing slice 12 replaces it; a battle scene shot at tactical zoom and
one at soldier eye level with standards in frame; compare-screenshots vs
assets/ref-rome2-banners.png (silhouette + how standards sit IN the
formation, not pixel-match); screenshot-critique last.
