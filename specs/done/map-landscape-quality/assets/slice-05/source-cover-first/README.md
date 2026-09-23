# Source-cover first production candidate — refine before adoption

One byte texture carries the existing source biome rock channel to the shared
material at world coordinates. Geometry, palette, lighting, water, planting and
camera remain fixed. This candidate predates the separately accepted rock-prop
removal, so both sides deliberately retain the same props. The before images
are the retained actual-production controls from that pass.

Three frozen SwiftShader views use 1280×800 at DPR 1. All source scenery records,
cameras and ticks match exactly, with no page errors. Changed pixel counts are
360671 (Alps), 169146 (Italy) and 262218 (close Alps). The small JSON reports
retain candidate-record hashes; comparison.json records exact equality checks.
No repeat was spent on this first candidate because visual review calls for
another material pass. No canonical image was adopted.

Fresh unprimed review moderately prefers the candidate's continuous mountain
mass over the previous bright crest bands. Root agrees. However, the candidate
loses green valley/shelf separation and looks uniformly barren near the camera.
Trees on these bare slopes read less grounded. This is an in-scope material
tradeoff to resolve before adoption, not a completed visual fix.

Both sets retain smooth/cloudy mountain detail, a sawtooth near-ridge boundary,
oversized pale angular roads and trees/rock props beside small settlements.
Italy's stepped shallows and strong sea shadows remain separate water/lighting
work. The rock props are removed by the later accepted ecological pass.

The source representation itself avoids two rejected intermediate problems:
per-vertex float coverage costs 12 bytes per resident vertex across budgeted
copies, and fine/coarse interpolation can disagree by 0.75. The native 589×486
byte raster costs 286254 bytes once and adds no tile buffers. CPU checks and
independent review pass, but architectural correctness alone does not establish
visual acceptance. The next candidate must interpret source region coverage
without erasing gentle-ground vegetation.
