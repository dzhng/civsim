# B4B1 Decision Note

Date: 2026-07-01

The `foreground-close-lab` route and evidence pack landed, but the slice is not
accepted as the final close foreground grass review surface.

Evidence:

- Full/crop/rejected-family shots live in this folder.
- `route-stats.json` records the default camera
  `{x:0,y:-36,zoom:104,pitch:0.78,yaw:-0.08}`, `1554` accepted field records,
  `1343` field-fiber-shell tufts, and `10744` submitted triangles.
- Target close crop is `760x180`; lab close crop is `815x182` and was
  center-cropped to `760x180` only for comparison.
- `compare-report/visual-parity-diff.json` records
  `parityDistance=0.25805` and `edgeEnergyRatio=0.13997`.
- Unprimed `screenshot-critique` verdict: **unfair scale**. The lab still reads
  as flat green ground with missing close blade/body depth, weak perspective
  cues, uniform lighting, smear/blur, artifact-like isolated strokes, and weak
  transition/mid review crops.

Decision: keep the route and artifacts as useful infrastructure/absence evidence,
but repair camera scale and perspective before running the close body technique
spike. Next slice:
`slices/03b4c5b4b1r-close-lab-scale-and-perspective-repair.md`.
