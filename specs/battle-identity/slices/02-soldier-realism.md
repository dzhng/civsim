# Slice 02 — Soldiers read as men; faction on accent parts only

**Contract:** at L0, body = linen/bronze/iron/leather/skin PBR with NO broad
team tint; faction color on shield face, helmet crest, tunic band (paint a
torso sub-band accent in soldierMesh.ts), saddle blanket. L1/L2 keep a
faction-readable accent (retain the shield box or an accent patch — extend
`if (lod<1)` for the shield only). Impostor: broad floor lowered (sweep
0.15-0.35), mask tint kept; atlas re-bakes with the new paint.

Mechanism: tierBroadMix -> [0, ~0.08, ~0.15] (sweep), IMPOSTOR_BROAD_MIX
sweep, tunic band paint, shield-at-L1/L2 geometry. Update
soldierMaterials.test.ts expectations deliberately.

**Verify:** model sheets (write-model-sheet) for every class; battle-lod zoom
sweep [1,2,4,6,9] — team-colour share must stay above its rail at every zoom
(the legibility guard); a heavy-both vibe frame at contact cropped 4x
(realistic bodies, readable factions); compare-screenshots against
assets/ref-rome2-closeup.jpeg (less-wrong verdict on "materials with faction
accents"); unprimed screenshot-critique. Full re-bless deferred to slice 09 —
verify on focused scenes only.
