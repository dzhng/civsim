# Current campaign composition fixtures

The five diagnostic compositions now pin the accepted terrain material and
current renderer output. Geometry, cameras, marker placement and test thresholds
are unchanged. All five images repeat exactly, including DPR2. Fog suppression,
actual city clicks, resize/recreation and hostile-order road/army occlusion pass.

Independent fresh review inspected every before/after pair and found no new
attachment, clipping, framing or occlusion defect. The current material shows
fractured rock and darker attached shadows; the fogged right slope is very dark.
The pins predated the rock-image and screen-UI changes. The precise historical
source of all shadow/ground-tone differences was not isolated, so this accepts
the composed result rather than attributing all changed pixels to one feature.

The old pins are retained in `before/`. The repeat log records the current scoped
checks. These fixture controls do not prove full campaign landscape quality.
