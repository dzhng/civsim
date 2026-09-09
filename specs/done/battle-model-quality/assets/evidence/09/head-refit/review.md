# Head integration: helmet refit required

The head-volume source is integrated through `53d5c746`. Rebuilding the combined
heavy kit preserves its newer scabbard, garments, footwear and loaded movement.
This is an **unaccepted composition**, not a completed helmet refit.

[Before head](before-head.png) and [new head with unchanged helmet](unfitted-head.png)
use the same production head-detail camera. The new facial volume is visible,
but the brow/eye region remains obscured by the helmet and side plates intersect
the cheek region. The source probe in [unfitted contact](unfitted-contact.log)
finds bowl and both plate intersections across its 448 samples. In ready, those
are 388 bowl/body triangle pairs, 214 left-plate/body and 220 right-plate/body.
The bowl uses a capped loft; its bottom surface must be distinguished from its
visible outer rim when diagnosing the intersection count. No count alone proves
what is visible or whether the helmet has the correct internal construction.

The next pass owns an open, fitted helmet and convincing eye/cheek clearance,
without changing anatomy to fit faulty equipment. Preserve both rejected source
and matched production views when comparing the replacement. The full combined
capture is process55291; [its log](capture.log) records exit1 with ten comparisons
against unaccepted earlier images. Production submissions, newly rendered frozen
repeat checks and the no-page-errors check pass. No baseline was blessed.
The Blender rebuild and exact candidate bake check pass. Neither those checks
nor this diagnostic close 08/09 or accept the 85,652-triangle provisional kit.
