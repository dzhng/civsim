# 06 — Blade silhouette / soft tip

**Track:** grass (on spike winner) · **Variable:** blade shape/taper ·
**Crop:** near-field foreground (close gate).

## Contract
The bezier-spine silhouette matches the pen's soft, tapered blades (segment counts,
width profile, fine tip, the pen's far-blade `wpx` widening so distant blades don't
vanish) — fixing the "agave wedge" failure mode the code comments already flag.

## API seam
Blade geometry/width-taper term in the winning grass material/geometry (segments per
tier; width taper exponent). Hold color (`04`) and density (`05`) fixed.

## Verification
screenshot-regression (close-gate baseline) + compare-screenshots vs hero foreground
+ screenshot-critique told it may judge only blade edge/taper.

## Must stay green
Near/mid density from `05`; the close-gate anatomy oracle.

## Delegated
Segment counts per tier; width taper exponent.

## Landed (2026-07-27)

Taper converges to a point on all tiers (near shoulder curve + terminal tip;
far 2-seg top vertex pair converges; view-facing bulk capped so rolled-leaf
thickness can't blunt the tip). Applies to shared production geometry
(shape-only improvement); production baseline movement folds into the slice-09
re-bless. Unprimed critique on the matched foreground zoom: MIXED leaning
NATURAL-STROKE — dominant blades correctly tapered/pointed; ~10-15% of small
background blades read teardrop (shoulder bulge under the slice-05 width lift).
Residual recorded as an optional polish nit for slice 40/09, not re-opened.
