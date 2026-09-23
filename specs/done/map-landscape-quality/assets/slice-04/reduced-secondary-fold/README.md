# Reduced independent secondary relief

Accepted as a modest simplification, not completion of mountain quality. Removing
only the28km fold retains the source envelope, dominant60km ridge/saddles,13km
fine detail, floor and coastal contract. It removes one noise evaluation instead
of adding a terrain algorithm. Source geography and campaign simulation are unchanged;
render height and slope-dependent placement continue through their existing owner.

Two-dimensional attribution found that the28km fold steepened potential gentle
passages. In the120km core, omitting it reduces median slope0.825→0.709, enlarges
the largest gentle-low patch23.25→65.75km², and lowers2km mesh interpolation error.
These are diagnostic thresholds, not visual acceptance metrics. Relief also falls:
median36.15→30.93 and max63.75→53.21 exaggerated render km. See [CPU control](cpu-control.md).

Matched regional Alps, Italy and close Alps production views all repeat exactly.
The XY focus, scale, lens and distance stay fixed; the existing camera follows
the changed terrain height at its target. Fresh visual review prefers the simpler
faces and saddles, with roughly equal/slightly smoother Italy. The tradeoff is
rounder summits and larger smooth rock slabs. Gray slopes still dominate and
broad grassy shelves remain insufficient:04/05/07 remain open.

A reported central road disappearance was investigated rather than hidden by a
lift/depth change. In the flagged candidate screen box, all774 sampled ribbon
points sit at least0.2315km above the presented terrain, while503 rays hit a
nearer ridge more than3km away in XY. Across the investigated route1425 samples,
the candidate has no sampled burial; the control has4, min−0.0397km. This supports
foreground occlusion for the reported stretch, not a claim that every road
triangle everywhere is intersection-free. See [road evidence](road-probe.json).

Fourteen root-focused tests and22 review-selected tests pass. Codex review found
no shared-source/query or coastline regression. Three exact repeats and fresh
visual review establish the bounded improvement. Existing official campaign LOD
baselines still require migration after the coupled material pass; do not claim
the full campaign suite or the reference-quality goal complete.

Further CPU-only Gaussian support and base-slope detail gates were rejected:
both increased steepness/fragmentation, and the gate introduced severe transition
cliffs and about4.6× query cost. Do not reintroduce those controls from their
larger low-area counts. Current attribution finds source-forced rock still covers
many genuinely gentle patches; investigate that interaction on this simpler form.
