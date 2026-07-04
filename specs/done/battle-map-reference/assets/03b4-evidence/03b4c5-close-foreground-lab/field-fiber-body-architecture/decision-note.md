# B4B1A1T decision - rejected

Date: 2026-07-01.

Judged variable: non-card field-fiber body architecture inside the fixed B4B1A0
close lab. Camera, terrain, meadow/root material, crop windows, palette, fog,
atlas content, and full reference composition stayed frozen.

## Verdict

Reject B4B1A1T. The non-card fiber variants remove the large `texture-volume`
card chunks, but they remove the close grass body with them. The result reads as
sparse regular pins on flat green ground, not dense foreground grass.

## Evidence

- Contact sheets:
  - `variant-contact-sheet.png`
  - `variant-crops.png`
  - `selected-field-fiber-full.png`
- Raw/crop captures:
  - `raw/*.png`
  - `crops/*-close-hero.png`
  - `crops/*-close-tight-2x.png`
- Metrics:
  - `compare-target-report/visual-parity-diff.json`
  - `compare-rejected-report/visual-parity-diff.json`
  - `stats.json`

Against the target close crop, the non-card candidates keep only
`0.13320x`-`0.15347x` of target edge energy. Against the rejected
`texture-volume` crop, they keep only `0.09140x`-`0.10662x` of its edge energy.
That is the core failure: the card artifacts are gone because nearly all visible
body is gone.

The selected `field-fiber-dense` path submits `193392` triangles from `1343`
source records with zero texture bytes. `field-fiber-body` submits `171904`
triangles, and `field-fiber-bundle` submits `150416`. Despite those counts, all
three still read as sparse posts. More per-record fiber geometry is not the next
useful variable.

## Neutral critique

The unprimed screenshot critique agreed:

- no non-card candidate fully succeeds;
- field-fiber/body variants remove large card slabs but do not preserve dense
  close grass body;
- the candidates mostly read as sparse upright pins on flat green ground;
- regular spacing creates a marker/debug read;
- `dense fiber` is nearly indistinguishable from regular fiber in body coverage;
- rejected card preserves more body, but only through the disqualifying card look.

## Next seam

Continue at
`slices/03b4c5b4b1a1u-field-fiber-source-topology.md`. That slice should change
the source topology: field-cell/subcell-owned dense micro-sources in the fixed
close lab. Do not move to perf, coverage, palette, atlas, LOD, camera-relative
generation, fog, terrain, water, cliffs, or full-reference composition until a
close-body source actually creates visible dense body without card artifacts.
