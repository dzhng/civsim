# Slice 03B4C5B4B1A1 - close body architecture matrix

## Contract

Compare close foreground grass body primitive families inside the accepted B4B1A0
lab and choose the least-wrong representation before tuning coverage. This slice
owns **body architecture choice only**.

Out of scope: coverage tuning, strand scale, clump rhythm, atlas colour/content,
camera-relative generation, backend policy, LOD collapse, cliffs, water, sky,
fog, terrain silhouette, and full `battle-map-reference` compose.

## Approach

- Freeze the accepted B4B1A0 lab camera, terrain patch, lighting, palette,
  meadow/root base, atlas seed, crop labels, and absence baselines.
- Test a shallow candidate matrix from the same fixed close camera. Include the
  current absence baseline plus a small set of plausible families, for example:
  texture-backed body carpet, texture-volume, denser alpha impostor volume,
  multi-plane tuft sheet, billboard/cluster control, and field-fiber shell
  control.
- For each candidate, record primitive family, generated records, submitted
  primitives, submitted triangles, instance bytes, texture bytes, draw calls, and
  obvious artifact class.
- Keep tuning shallow. The question is which representation can plausibly form
  the target's close soft body, not how dense it can become after parameter
  hunting.

## Accept / Reject

Accept only if one candidate is both less wrong than the B4B1/B4B1R absence
baselines and credible as a close foreground grass body, without already reading
as specks, stamps, straw wires, card walls, curtains, or flat painted ground.

If every candidate still reads as one of those artifact classes, do not promote
the least bad option into B4B1A2. Record the matrix, mark the family search
failed, and reslice before coverage tuning.

Reject a candidate if it only looks dense by changing palette/fog/camera scale,
depends on debug occupancy colour, hides exposed ground with full-frame tricks,
requires GPU-only generation before B4C0 accepts the backend seam, or has no
credible path to camera-relative LOD.

## Verification

- Archive candidate contact sheet, selected full lab shot, close/tight crops,
  stats JSON, and decision note under
  `assets/03b4-evidence/03b4c5-close-foreground-lab/body-architecture-matrix/`.
- Include B4B1/B4B1R and rejected B4C5 family crops as absence/rejection
  baselines.
- Use `compare-screenshots` against the target close-hero crop and rejection
  baselines. Judge body family and artifact class only, not final coverage.
- Run unprimed `screenshot-critique` scoped to: "Which candidate is least wrong
  as a close foreground grass body, and what artifact disqualifies each rejected
  candidate?"
- Open the candidate sheet with `preview-shots` as a non-blocking checkpoint.
- Keep focused lab route checks and `tsc --noEmit` green.

## Next Slice

This slice rejected the family matrix. Continue with
`03b4c5b4b1a1r-texture-volume-continuity-repair.md` before any perf envelope or
coverage tuning.

## Result - 2026-07-01

Evidence:

- `assets/03b4-evidence/03b4c5-close-foreground-lab/body-architecture-matrix/candidate-contact-sheet.png`
- `assets/03b4-evidence/03b4c5-close-foreground-lab/body-architecture-matrix/candidate-crops.png`
- `assets/03b4-evidence/03b4c5-close-foreground-lab/body-architecture-matrix/least-wrong-full.png`
- `assets/03b4-evidence/03b4c5-close-foreground-lab/body-architecture-matrix/stats.json`
- `assets/03b4-evidence/03b4c5-close-foreground-lab/body-architecture-matrix/compare-target/report/visual-parity-diff.json`
- `assets/03b4-evidence/03b4c5-close-foreground-lab/body-architecture-matrix/compare-rejections/report/visual-parity-diff.json`

`texture-volume` is the least-wrong family because it is the only candidate that
creates visible close grass body. It is still rejected by this slice's own accept
bar: the crop reads as separated hanging curtain / hay-mat islands with exposed
flat ground, not a continuous soft grass body. The neutral screenshot critique
also picked `texture-volume` as least wrong, but named the same shredded-curtain
and island-boundary artifacts, so the next pass must repair that architecture
before B4B1A2 can measure a budget.

Rejected candidates:

- `field-fiber-shell`: smooth flat shell / body absence.
- `alpha-impostor`, `billboard-cluster`, `volume-card`: sparse post/card controls
  over flat ground.
- `texture-carrier`: large diagonal straw/wire carrier sheets.
- `texture-micro-carrier`: mostly invisible pixel grit.
