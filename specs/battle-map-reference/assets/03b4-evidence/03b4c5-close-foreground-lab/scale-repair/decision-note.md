# B4B1R decision note

Date: 2026-07-01

Verdict: rejected.

The `scale-repair-low` camera profile improved the close-lab evidence surface but
did not make the crop fair against the reference foreground. The route kept grass
inputs frozen and added neutral calibration guides, yet the selected close crop
still reads as smooth green ground with faint smears rather than dense vertical
grass body.

Recorded diagnostics:

- `parityDistance=0.25268`
- `edgeEnergyRatio=0.13216`
- screenshot-critique verdict: unfair scale

Learning: do not continue tuning camera, crop windows, fog, palette, terrain, or
full-scene composition to solve this. The next useful slice is B4B1A: a close
foreground grass body technique spike that chooses a representation before
coverage, strand scale, clump rhythm, camera-relative generation, or LOD collapse.
