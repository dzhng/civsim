# Shared physical campaign crowd checkpoint

The campaign frame still selects representative classes, layout, allegiance and
clips. The physical crowd owns one asset-to-world scale, applied to skinned mesh
positions, animated culling bounds, projected LOD span, and far-impostor centers
and spans. Terrain elevation stays in world coordinates and is never multiplied
by figure scale. Battle keeps the default scale and its existing shadow rig.

The crowd implementation now has a neutral home because both worlds actually
consume it. This is the existing palette/material/impostor pipeline, not a
campaign copy. Campaign composition retains submitted instances, seats them on
the currently presented triangles, filters current visibility, and disposes its
crowd with the world. Animation still comes from the submitted instance phase.

## Evidence and limits

The [scene](../../../../web/scenes/campaign/campaign-crowd-grounding.mjs) uses actual
`buildEntityFrame` output on a fixed campaign camera. Its
[coarse](../../../../web/shots/campaign/campaign-crowd-coarse.png),
[raised](../../../../web/shots/campaign/campaign-crowd-raised.png), and
[hidden control](../../../../web/shots/campaign/campaign-crowd-empty.png) snapshots
repeated with zero differing pixels on SwiftShader, 1280×800 DPR1. Removal,
reappearance, campaign overview hiding, fog-query replacement, terrain admission
and eviction, and world recreation passed with no GPU warnings or page errors.
This is bounded renderer integration evidence; production command/label/cart
migration, DPR2 campaign acceptance and hardware performance remain separate.

The [fixed-pair telemetry](comparison.json) establishes that figures produce real
pixels rather than merely successful counts. Full-frame pixel mismatch is 0.00168;
the difference is confined to soldiers and their shadows. The candidate is less
wrong because the frame's representatives are present at the intended scale.

Fresh unprimed inspection of both frames and all four crops found no missing
soldiers, floating feet, penetration, broken depth, or new raised-ground defect.
The existing two-row arrangement reads as three paired shapes from this camera;
individual limbs are soft at strategic scale. Both remain recorded readability
limits of the unchanged campaign figure arrangement. Raised eastern shadows
continue downhill from the models rather than detaching.

## Validation and change ledger

Eight focused CPU files passed 51 tests; typecheck and diff whitespace checks
passed. The existing exact battle LOD audience-sequence pin is unchanged. A red
control forcing unscaled bounds failed the new campaign bounds test as intended.

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| projected campaign scale / photorealCrowdLod | No campaign-scale case; edge figure culled under unscaled control | Scaled off-axis body admitted; projected span grows 2.4× and chooses finer detail | All visibility and detail decisions use the rendered scale (new coverage) |
| far facing/anchor / impostorLayer | Unit-scale facing, anchor, corpse and material assertions | Same assertions at scales 1 and 2.4; scaled anchor height and span also pinned | Far representations preserve the same scale as skinned geometry (expanded coverage) |
| campaign-crowd-grounding | No physical campaign crowd checkpoint | Actual frame figures, dynamic membership, presented seating, disposal/recreation and three exact snapshots | Campaign now uses the shared physical crowd (new coverage) |

Other touched tests only import the new neutral module location; their assertions
and pins did not move. No unit stats, commands, crowd physics or troop generation
changed. Independent Codex review flagged only an absolute public-asset symlink
used to run this sparse checkout. It was removed after capture; no asset or
local-dependency link is included in the commit.
