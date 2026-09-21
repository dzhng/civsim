# Marginal GPU layer attribution

One fixed TypeGPU build retains all production passes and uses scratch draw
masks for backdrop, crowd, grass and bloom. Missing-content arms are diagnostics,
never candidate optimizations. Sky is separately labeled within its existing
pass; the world pass is not split. Shadow/pose/grass-routing commands remain.
Framebuffer2880×1800, sample count1, single shadows, seed/hash and all15,560
soldiers are fixed at tick30. Each camera/family uses full/omitted/omitted/full,
50 complete submission-matched GPU samples per arm. Both rounds completed48
blocks without browser errors, warnings, query gaps or missing selected results.

The first round's zoom-dial labels were misleading:7.5 means859.10metres at this
viewport, and1.5 means3200metres. Those distant results remain preserved but do
not represent screenshot-like tactical framing. The second round sets physical
distance through the real Camera's inversion/clearance policy and verifies the
achieved camera:200metres at pitch0.4526 and0.2, plus600metres at0.4526. Root
inspected the actual full-content PNGs; soldiers are clearly framed in the
200metre controls. This is not final visual/motion acceptance.

Average of the two block medians, main-pass GPU interval in milliseconds:

| Physical framing | Full → no crowd | Full → no grass | Full → no backdrop |
| --- | ---: | ---: | ---: |
|200m tactical|13.65→6.30|13.69→11.78|13.80→13.74|
|200m low angle|13.76→6.28|13.93→11.74|13.90→13.80|
|600m wider|9.31→5.74|9.44→7.58|9.36→9.15|

Bloom removal changes the observed GPU union by roughly0.3–0.9ms in this round;
backdrop removal is a small effect. Prioritize crowd geometry/shading, then grass,
rather than rewriting backdrop or bloom from code inspection alone. At200metres,
3,924 visible soldiers request15.85million main mesh triangles; the low-angle view
has11,709 visible soldiers, including7,780 impostors, and15.95million mesh triangles.
Nearly all visible mesh soldiers chooseL1. Inspect geometry versus shading and LOD
readability before deciding how to reduce that work.

GPU intervals overlap. Their sums are not elapsed GPU time; omission deltas are
marginal effects, not additive exclusive costs. Shadow timings also shift despite
unchanged shadow commands, showing scheduling/frequency effects. In the distant
wide view, grass has zero beauty draws in both arms, so its small apparent delta
is variability, not a grass improvement. Current main includes geometry only;
prior live main labels included sky. The fixed scene is not the intense live
contact state, and none of these results proves60FPS or pays the shadow budget.
