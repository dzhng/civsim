# Roads And Junction Geometry

## Contract

Roads are continuous, readable world geometry. They may be raised meshes or
depth-aware ground decals with explicit elevation bias, but they cannot be
hidden under terrain, cut off by terrain tiles, or break at city and junction
volumes.

## Human Check

Close Rome and central Italy views should show white-grey stone roads with
clear continuity. Road endpoints meet city volumes cleanly. Junctions around
Roma remain readable. Roads only cross water when a bridge, ferry, or sea-lane
semantic is explicitly rendered.

## Verification

- [ ] Add a fake road-continuity harness with sloped terrain, junctions, coastline,
  and city occluders.
- [x] Add pixel probes for road centerline visibility over terrain and at segment
  joins.
- [x] Add real central Italy crops around Roma, Tibur, and the close Rome road
  network. Extend this evidence with Ostia/Portus, Narnia, and Spoletium crops
  when the fake continuity harness lands.
- [x] Store captures under `visualizations/campaign-roads/`.

## Done

- [x] Roads remain above or visibly integrated with terrain in the current
  campaign LoD scene matrix.
- [x] Real-map road segments do not disappear midway, show broken gaps, or sink
  below terrain in close Rome and regional Italy.
- [x] City/junction treatment reads intentional at Roma and Tibur, not clipped.
- [x] Real-map road rendering filters unsafe land/water samples so roads do not
  cross water unless the edge is an explicit sea-lane semantic.
- [ ] Prove the same contract in a synthetic hostile fixture with sloped terrain,
  coastline, city occluders, and known road anchors.

## Implementation Notes

- 2026-06-28: WebGPU road meshes now follow the previous renderer's topology:
  each road is resampled into one continuous centerline, then drawn as a dark
  embankment ribbon under a bright stone ribbon. Every ribbon vertex samples
  the canonical campaign terrain height. Roads are no longer cut back around
  cities or junctions; city and army volumes occlude the road through shared
  world depth instead of relying on artificial endpoint gaps.
- 2026-06-28: The road surface was rebalanced toward the visual contract:
  slightly wider, lighter white-grey stone over a darker embankment. The
  regional verifier keeps a camera-band tolerance because projected semantic
  centerline samples can land just outside the visible ribbon under perspective;
  close camera checks remain stricter.
- 2026-06-28: Road hubs now emit explicit cap geometry from the same land-safe
  road set as the ribbons. Caps are limited to true degree-3+ hubs so Roma-style
  intersections read as intentional road junctions without decorating ordinary
  two-road bends with stray circles. City hubs use tier-sized stone aprons so
  roads visibly enter the settlement footprint while the city model still
  occludes the road through world depth. Road centerlines smooth only interior
  control points, preserving canonical endpoint geography while removing sharp
  low-poly kinks at visible joins. The LoD scene asserts `roadJunctionCaps`, and
  focused evidence lives under `visualizations/campaign-roads/`.
- 2026-06-28: Coastal roads now use majority-land tolerance instead of rejecting
  the entire edge on the first water sample. City and road topology are the
  campaign ground truth; a noisy coast sample may not erase the Roma-Ostia/Portus
  road. Rendered water-crossing probes still guard against visible roads running
  through open sea.
- 2026-06-28: Fresh screenshot critique of the updated close Rome captures still
  flags Roma's road hub as visually messy and Tibur's road as jagged/kinked. The
  structural fixes above are a stable checkpoint, not final road acceptance; the
  next road pass should replace the low-poly ribbon/junction treatment with
  smoother grounded geometry and clearer road-city layering.
