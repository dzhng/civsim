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

- Add a fake road-continuity harness with sloped terrain, junctions, coastline,
  and city occluders.
- Add pixel probes for road centerline visibility over terrain and at segment
  joins.
- Add real central Italy crops around Roma, Tibur, Ostia/Portus, Narnia, and
  Spoletium.
- Store captures under `visualizations/campaign-roads/`.

## Done

- Roads remain above or visibly integrated with terrain at all campaign LoDs.
- Road segments do not disappear midway, show broken gaps, or sink below terrain.
- City/junction treatment reads intentional, not clipped.
- Bridges/ferries/sea lanes are explicit before any road crosses water.

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
