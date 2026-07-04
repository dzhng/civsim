# B4B1A1 body architecture matrix decision

Date: 2026-07-01

Verdict: matrix rejected. `texture-volume` is least wrong, but not accepted.

## Target

Choose a close foreground grass body primitive inside the accepted B4B1A0 lab.
The only judged variable is body architecture. Camera, terrain, fog, lighting,
palette, meadow/root base, crop windows, target crop, and absence baselines stayed
fixed.

## Evidence

- `candidate-contact-sheet.png`
- `candidate-crops.png`
- `least-wrong-full.png`
- `stats.json`
- `compare-target/report/visual-parity-diff.json`
- `compare-rejections/report/visual-parity-diff.json`

The target close comparison reports `parityDistance=0.29215` and
`edgeEnergyRatio=1.48818` for `texture-volume` versus the target close crop. The
extra edge energy is not accepted as useful grass detail: direct inspection shows
chunky separated clump edges and exposed smooth ground.

## Matrix

- `field-fiber-shell`: 1,343 records, 10,744 triangles, 85,952 instance bytes,
  one draw. Rejected as smooth flat shell / body absence.
- `alpha-impostor`: 69 records, 3,864 triangles, 4,416 instance bytes, one draw.
  Rejected as sparse post/decal control.
- `billboard-cluster`: 69 records, 3,864 triangles, 4,416 instance bytes, one
  draw. Rejected as sparse upright cards.
- `volume-card`: 69 records, 4,416 triangles, 4,416 instance bytes, one draw.
  Rejected as sparse card-wall control.
- `texture-volume`: 1,100 records, 22,000 triangles, 70,400 instance bytes,
  65,536 texture bytes, one draw. Least wrong because it creates visible body,
  but rejected as hanging curtain / hay-mat islands over flat ground.
- `texture-carrier`: 534 records, 8,544 triangles, 34,176 instance bytes,
  65,536 texture bytes, one draw. Rejected as large diagonal straw/wire sheets.
- `texture-micro-carrier`: 1,427 records, 11,416 triangles, 91,328 instance
  bytes, 65,536 texture bytes, one draw. Rejected as mostly invisible pixel grit.

## Neutral critique

The unprimed visual reviewer chose `texture-volume` as least wrong and would
continue with it, but also named the visible blocker: clumps read as hanging
shredded curtains or hay mats with obvious island boundaries. That matches the
slice's predeclared reject classes, so the slice cannot promote B4B1A2 yet.

## Next

Resliced next pass:
`slices/03b4c5b4b1a1r-texture-volume-continuity-repair.md`.

The repair must keep the B4B1A0 lab frozen and change only the `texture-volume`
body's continuity/primitive shape. Do not tune coverage, perf, strand scale,
palette, fog, camera, or the wide reference route until this artifact is gone.
