# Slice 10 — the shared 3D standard asset (cloth that waves)

**Contract:** ONE 3D standard model family owns the flag look for both maps:
pole + gold finial + crossbar + tall vertical faction-field cloth with
swallowtail cut, gold trim, emblem — the Rome-2 silhouette the DOM SVG
(unitBanner.ts:48-81) and the flat campaign panels
(campaignEntityModels.ts:59-85) each approximate today, built once as real
geometry. The cloth WAVES: a shader-side wind displacement on the cloth
vertices (pole/crossbar rigid), deterministic phase like the grass
(grassPass.ts:184-199 windPhase/windStrength pattern) so snaps stay
byte-stable at a pinned time. Faction field/trim colors come from the
slice-01 faction table — no new color sites.

Parameterized by scale/tier only (battle unit standard, campaign army
standard, campaign settlement banner are sizes of the same asset), so the two
maps cannot drift apart again.

References: assets/ref-rome2-banners.png (battle),
assets/ref-rome2-campaign-banner.png (campaign settlement banner over Roma —
tall cloth, reads at strategic zoom).

**Verify:** model sheet for the standard family (both factions, the size
tiers); write-anim GIF of the wave cycle — the cloth should ripple, not
flap rigidly or stretch the trim; screenshot-critique on both.
