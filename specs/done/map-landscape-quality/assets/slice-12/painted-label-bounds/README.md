# Reserve the painted halo in label occupancy

The shared label rectangle now includes the outward half of the existing halo
stroke. Atlas gutters stay transparent and non-colliding beyond that stroke;
font, palette, world anchors, card layout and priority/culling policy are unchanged.
The same inset feeds arbitration and published debug rectangles, including rotation
and DPR conversion. These are conservative rectangles, not per-glyph pixel masks.

## Actual effects and tradeoff

The former2.275px fill gap between IULIA CONCORDIA and AQUILEIA was smaller than
their combined3.1px halo reach. The corrected shared claim reserves that stroke,
and the existing importance rule suppresses IULIA CONCORDIA at the tested Alps
view. OVILAVA also yields to LAURIACUM. Both settlement models remain at their
unchanged anchors. No names or models are moved to hide the overlap.

Only2,385 Alps pixels change, all within the old/new label boxes. Italy and close
Alps remain pixel-identical. All three candidate views repeat exactly; cameras,
ticks, scenery, city bodies, standards and water remain equal, with no page errors.
The UI-only controls are under slice10's screen-output/merged-production evidence.

Fresh review prefers the southern separation and the result overall, but finds
the northern pair distinguishable before culling. **The cost is reduced name
density in a readable tight pair.** We retain the existing conservative rectangle
and importance policy with the real halo included; no new per-glyph collision
system or special-city exception is introduced. This is a bounded collision
correction, not a claim that every removed name was unreadable.

## Verification and remaining gate

All31 existing collision/raised-label checks pass on the candidate, including
Londinium/Arverni, all own-city cards in the Roma cluster, same-frame card bounds,
Pella, and raised labels at DPR1/2. All four snapshots repeat with zero differences.
The production collision captures report Apple Metal3; the raised-label captures
did not record adapter identity separately.

The original LoD walk through regional-natural passes18 of19 checks. The sole
failure is unchanged: labelRatio0.001 <0.002. Its12 reported names are unchanged
from the UI-only candidate, so this frame's shortfall is not caused by the new
culling. The floor remains in force pending the independent oracle audit.

Six new CPU cases exercise halo coverage, rotation, DPR and both touching and
separated names through the real frame owner with recorded painter commands.
They establish geometric behavior, not pixel-exact font extents. All550 frontend
tests, typecheck and the production build pass after integration. No existing assertion, threshold or
canonical baseline was repinned: the projection fixture gained its required inset
field, and the collision scene's explanatory comment follows the updated bounds.
