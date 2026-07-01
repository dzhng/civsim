# B4B1A1X decision - reject field-owned shell silhouette

## Verdict

Rejected. The slice proved that a field-owned domain can own geometry and
publish useful telemetry, but the visible result is not continuous close grass
body. It reads as flat green paint plus a few oversized pasted shell strokes.

## Evidence

- Variant sheets:
  - `variant-contact-sheet.png`
  - `variant-crops.png`
  - `selected-field-domain-shell-full.png`
- Raw captures and crops live under `raw/`.
- Telemetry:
  - `stats.json`
  - `silhouette-telemetry.json`
- Comparison reports:
  - `compare-target/out/visual-parity-diff.json`
  - `compare-rejected-v/out/visual-parity-diff.json`
  - `compare-rejected-w/out/visual-parity-diff.json`

## Key Measurements

- Selected `field-domain-shell`: `1292` domain cells, `38x34` grid, overlap
  `1.0`, `62016` submitted triangles, `4128` geometry bytes, `0` material
  bytes, and `grassPrimitiveDomainSourceAttached=false`.
- `field-domain-low-shell`: `1550` domain cells, `45x40` grid, `62000`
  submitted triangles, `3440` geometry bytes, and `sourceAttached=false`.
- Against target close crop, edge energy remains very low:
  - `field-domain-shell`: `edgeEnergyRatio=0.16780`
  - `field-domain-low-shell`: `edgeEnergyRatio=0.15848`
- Against rejected W material-only crop, X is very close except for a few added
  hard edges:
  - `field-domain-shell`: `parityDistance=0.15812`
  - `field-domain-low-shell`: `parityDistance=0.15747`

## Visual Findings

Main inspection and neutral `screenshot-critique` agree:

- The center remains mostly empty/flat.
- The visible geometry appears as large yellow-green shell/card strokes, not a
  dense grass body.
- The strokes are far too large for the close foreground scale and do not sit
  convincingly on the ground plane.
- The target's soft, high-frequency grass-body edges are still missing.

## Learning

Field ownership alone is not enough, and low-count shell mesh ownership is the
wrong visible primitive. The next slice should keep the field-owned domain seam
but test a pixel-scale micro-strand silhouette representation: many bounded,
hairline strokes per domain cell, with telemetry for strand count, per-cell
strand budget, screen/world size limits, source attachment, and triangle cost.
