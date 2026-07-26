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
