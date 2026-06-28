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

- 2026-06-28: road strips and sidewalls are tessellated at short world-space
  intervals and each cross-section samples the canonical campaign terrain
  height. This prevents a long road triangle from interpolating below a raised
  terrain ridge and visually cutting off while its endpoints remain correct.
