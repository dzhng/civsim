# Linear water blending

The battle terrain shader must convert each display-authored color once, then
blend light values in linear space. It previously converted water, mixed it with
unconverted ground, and converted that mixture again. Dry terrain now converts
before the mix; already-linear water enters directly. The shared shoreline blend
range and water palette/fade policy have one neutral owner consumed by both
backend adapters. No palette values, shoreline geometry or physics change.

## Verification

Control is the immutable 9b9481de bitmap build. Candidate includes the two-file
water correction. All captures exclude scenery, so parallel crown changes cannot
contribute shadows or tree pixels. The generated lake is rendered by the ground
material; no separate lake draw exists for this recipe. The coast view includes
one real ocean draw. Actual camera parameters are recorded, including clamping.

| View | Changed pixels | RGB mean absolute difference |
| --- | ---: | ---: |
| Lake overview | 223,384 | 9.47198 |
| Lake oblique shore | 674,931 | 28.88216 |
| Coastal join | 80,810 | 2.18911 |
| Dry ground control | 0 | 0 |

All four repeat exactly with no page errors or GPU warnings. Combined frontend
suite passed 1,075 tests, typecheck and build; independent static review found no
actionable issue with conversion endpoints, blending or the unchanged Three
values. No unit-test thresholds or simulation tests changed.

## Visual verdict and remaining scope

Root and unprimed review favor the correction: sunlit turquoise replaces the
very dark blue hole, and dry ground remains pixel-identical. This is acceptance
of the color-space boundary, not finished water art. The lake still lacks visible
surface cues and has a broad pale shore band that reads as a bevel. Both coastal
controls contain jagged geometry on the extreme left; this pass does not fix it.
Shore geometry, composed scenes, water motion and hardware acceptance remain open.

The patch adds no GPU resources, dependencies, schema or new rendering pass.
Three imports existing shared constants rather than maintaining a duplicate
palette and distance-fade table. Existing numeric policy is unchanged.
