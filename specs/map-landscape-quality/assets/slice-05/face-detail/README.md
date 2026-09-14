# Face-oriented terrain response

The shared material replaces world-height contour lines with three planar
procedural fields weighted by the geometric normal. Campaign and battle consume
the same response. Surface detail affects albedo, dry roughness and shading
normal; mesh positions, physical slope, source coverage and water remain owned
by their existing producers.

The procedural choice avoids a new texture dependency or GPU allocation. It
uses the installed Three triplanar axis weighting and the surface-gradient
normal basis used by its bump node. Explicit screen derivatives are necessary:
Three's texture-UV bump helper does not differentiate arbitrary procedural
fields. A same-scene geometric-normal control changes 22,490 pixels, proving the
new normal response affects lighting. The distant view attenuates subpixel
modulation instead of leaving isolated hard dots.

## Visual evidence and limits

The before/after pairs freeze the extraction commit's geometry, lighting,
camera and trees. The ramp isolates the response; the Alps pair shows its effect
on real geography. Near/far ramp snapshots supplement the crops. These are
material comparisons on pre-04 geometry, not acceptance of the merged mountain
form or woodland placement.

Fresh comparison judged the after images less wrong: the conspicuous drawn
contours are absent, the Alps relief reads more coherently, and the final
iteration reduces the earlier parallel streaking. No new hard seam, tile
boundary or far-view moiré was identified. The critic still finds the close
rock soft/cloudy, the grass grain uniform, and the grass/rock boundary broadly
feathered. This pass is an accepted artifact reduction and a working shared
face response; convincing close rock and the combined 04/05 appearance remain
open. It does not declare slice 05 visually complete.

Two earlier candidates were rejected: one was too quiet with isolated dark
marks; the next produced a conspicuous crack network. A third removed that
network but stretched its broad modulation. The retained candidate reduces
anisotropy and adds finer face variation. No losing candidate was blessed.

## Protected behavior

Seven SwiftShader snapshots repeat with zero differing RGBA pixels: both consumers,
near/far ramps, Alps, Italy and water. The material ramp consumers also have
identical RGBA. The water snapshot remains
unchanged and its terrain/standalone samples both read `[76,134,151]`. Shared
material changes introduce no terrain buffer, texture, worker or source-data
allocation. Their incremental cost is fragment shading.

A matched hardware traversal measured p95 **33.33 ms** for both the extraction
and face-response versions, above the unchanged 33 ms gate. Both measured a
33.335 ms warm-admission maximum; bounded memory, idle stability and DPR2 checks
passed. The face response has no measured additional regression in this pair,
but this is not a passing traversal performance result. Raw
[extraction](extraction-traversal-hardware.json) and
[candidate](face-traversal-hardware.json) reports retain provenance and scope.
The earlier slice-03 performance result preceded the unified tiled slope profile;
combined production performance remains an integration issue.

Matched hardware turf/seam controls pass all 24 behavior checks without page
errors. Dirt edge, edge ruler, road edge and both RTS flat-ground views remain
byte-identical to extraction. Rock/scree and distant terrain captures change;
[measured differences](hardware-comparison.json) preserve those deltas rather
than claiming all battle pixels are unchanged. Inspection found no new terrain
gap. Full canonical SwiftShader turf readiness remains the inherited limitation
documented in the [extraction evidence](../extraction/README.md); the default
readiness guard and unrelated baselines were not weakened or re-pinned.

## Review and test ledger

Shape review retained one material response with direct callers. The optional
normal argument carries a shader result, not a second material policy. Battle
still owns physical tint decoding, RG8 earth masks, turf and vista orchestration.
The lab-only geometric-normal control does not add a production toggle.
Independent code review found only the pending intentional snapshot refresh;
no additional code defect was reported. Typecheck and all 464 tests pass.

Existing material/ramp and regional snapshots change because the shared rock
response changes; the water snapshot does not. The new near/far snapshots cover
material minification and close readability. The normal control adds a visible
response assertion; equivalent-consumer comparison remains exact. No physics,
passability, geometry, climate or lifecycle assertion changed.

The implementation adds roughly 110 net lines across the shared response and
its lab/scene probes. Review images occupy about 4.5 MiB; the two added canonical
scale probes about 1.1 MiB. They are test evidence, not runtime assets.
