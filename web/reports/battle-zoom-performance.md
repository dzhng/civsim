# Battle zoom and rendering work

## Findings and disposition

| Priority | Trigger and owner | Measured impact | Disposition and acceptance seam |
| --- | --- | --- | --- |
| P1 | Wheel input multiplied the authored dial in `Camera.zoomAt`. | Fifty normal wheel events changed physical distance only from 3,200 m to 3,194 m; subsequent events crossed the steep part of the curve and reached the near floor. | Wheel input now changes physical distance through the existing inverse rig mapping. The camera regression test was observed red, then green. Hardware browser input moves immediately, evenly, and reverses immediately. |
| P1 | Grass activation used the same dial in `BattleGrassField`. | After correcting wheel distance, twelve small wheel events still left the view 2,579 m away but enabled about 7.0 million grass triangles. | Projected blade pixels now decide whether base geometry and the dense focus ring are needed. The actual browser regression was observed red, then green with grass disabled in that wide view. Thresholds and active state are published in grass detail stats. |
| P2 | Production grass retained subdivisions intended for taller blades. | With identical record placement, Standard grass submitted 11,227,160 triangles at the mid-close view and 7,894,016 at the close view. | Reduced near/mid subdivisions give 7,151,696 and 5,824,112 triangles: 36.3% and 26.2% less. Far blades retain their intermediate vertex to preserve coverage. Low quality is reduced too; Fine is unchanged. |
| Deferred | Visible soldier LOD and shadow demand. | The wide view already draws all 14,300 visible soldiers as impostors. Shadows retain low-tier meshes; disabling shadows helped less than disabling dense grass in the tested views. | No blanket soldier-LOD downgrade or removal of shadows. Close readability is preserved. |
| Deferred | Retina framebuffer cost and other machine activity. | Retina increases framebuffer area; timings varied substantially while unrelated work ran on the host. | No resolution downgrade. Timing samples are diagnostic, not a claim of a guaranteed frame rate or an isolated hardware release benchmark. |

The default Balanced Host battle, generated seed 7, was used. Hardware Chrome
ran at 1600×900 CSS pixels with a 2× device scale for the Retina checks. The
reported steady 19 FPS was not reproduced reliably; frame-time spikes were.

## Choices audit

- **Sound, high confidence:** preserve the authored framing curve and make wheel
  input act on distance. Existing camera poses and overzoom limits remain usable.
- **Sound, high confidence:** pan speed follows physical distance too. Otherwise
  the corrected first wheel event would collapse pan speed while barely changing
  the visible framing. Its separate regression was observed red and then green.
- **Sound, medium confidence:** grass activation uses nominal blade size at the
  view's target. A half-pixel base threshold and a hysteretic focus-ring threshold
  keep invisible work out of the overview while retaining detail when readable.
- **Sound, high confidence:** retain two segments as the minimum silhouette.
  Independent review caught the rejected one-segment candidate narrowing blade
  coverage; no such candidate is shipped.

## Change ledger

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `camera.test.ts`, pan-speed test | Cap and slowdown were asserted against raw rig-dial positions, even where visible distance was unchanged. | Cap and slowdown are asserted against actual viewing distance. | Wheel correction exposed the dial/physical-distance mismatch in pan control. **moved** |
| `camera.test.ts`, proportional wheel regression | New regression measured 3,200 m → 3,200 m for a nonzero zoom step; its added pan assertion also failed after the initial wheel fix. | A factor of 1.08 changes physical distance by 1/1.08 throughout the range; a small initial zoom does not collapse pan speed. | The camera's existing inverse mapping now owns distance-based input. **moved** |
| `battle-wheel-zoom.mjs`, wide-view grass check | New browser regression measured enabled grass and about 7 million triangles while still 2,579 m away. | The same gesture ends at the same distance with grass disabled and zero initial submitted grass triangles. | Detail follows projected size, not dial position. **moved** |

No simulation mechanics, unit stats, soldier meshes, grass dimensions, density,
placement, or existing screenshot baselines were changed.

## Verification

- All 408 web unit/component tests passed; the focused camera suite passed.
- Hardware browser wheel scene passed all four behavior checks without page errors.
- Matched hardware before/after captures at two close views changed only 7 and
  60 pixels using the perceptual comparison threshold. Fresh visual review found
  no coverage gaps, new bands, or change in soldier readability. Stills do not
  establish temporal shimmer behavior.
- Independent review's one-segment coverage finding was fixed. Follow-up review
  found no actionable camera, lifecycle, projection, or render-path regressions.
- The strict legacy `battle-grass-soldier-scale` screenshot differed by 34.6% in
  the hardware run (including pose/raster differences); it was not re-blessed.
  Its software-GPU run timed out during readiness without page errors. These
  checks remain unresolved; this is not a claim that every visual baseline is green.
- Initial timing comparisons affected by a development reload were discarded.
  Later paired captures verified the selected profiles from runtime segment
  counts before comparing them. Background work still prevents a clean FPS claim.
