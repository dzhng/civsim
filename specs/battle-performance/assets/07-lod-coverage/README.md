# Geometry coverage versus shaded appearance

Both mesh tiers were drawn with their normal materials and with an identical
opaque constant-color fragment result. Positions, depth and visibility retain
the real mesh path. This removes internal lighting variation; it is a diagnostic
image treatment, not a proposed game appearance or timing result.

Eight captures cover tactical and low-angle physical 200m cameras. The raw
report also retains the configured but unused 600m camera; it was not captured. Each tier
starts in a fresh page, follows the same camera order, and records the actual
tier counts immediately before each screenshot. All counts match the original
GPU experiment: tactical 60 L0 plus 3864 L1 or L2; horizon 80 L0 plus 3849 L1 or
L2 and 7780 impostors. Shadow counts and geometry are unchanged. The frozen tick,
state hash, resolution and content checks pass; browser warnings/errors are empty.

The first attempt reused a page after changing camera angle. LOD hysteresis kept
20 extra L0 soldiers in its second tactical arm. That attempt is not the matched
comparison: it is retained under the scratch `history-confounded/` directory.
Corrected run 87478 and image metrics 51030 are terminal. The fixed build,
runner, full frames and cropped comparisons are in `throwaway/lod-coverage-probe/`.
The temporary build worktree has been removed.

Independent review inspected eight full frames and twelve crops. Its strongest
finding was thinner, more fragmented pike shafts in L2, persisting in constant-color
views at both camera angles (high confidence). Overall body mass, positions and
formation coverage remain, with local shoulder/arm/torso contours and overlap
holes changing (medium confidence). Removing material shading removes most internal
body contrast differences. Root's crop inspection agrees. No wholesale soldier
loss is demonstrated, and image evidence does not identify an exact missing mesh
component or separate material effects from surface orientation.

Next: test an intermediate reduction with L1's component-preservation settings,
starting with pikes. Preserve the original source assembly, rig, materials and
other tiers. Require readable shafts with full materials and in motion before
expanding or measuring the whole roster. All final quality and live-performance
gates remain open.
