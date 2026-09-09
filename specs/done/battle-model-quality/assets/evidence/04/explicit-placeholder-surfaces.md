# 04a source material proof

This pass authors material IDs and faction masks at primitive construction and converts the historical placeholder sRGB palette to canonical linear vertex color. It does not improve geometry, animation, or final art. The integrated renderer owns visual acceptance.

## Verification

- Exact typed-array byte comparison against the pre-change generator: all 20 appearances, 60 tiers, 16,560 vertices. Positions, normals, joints, weights, UVs, tangents and indices are byte-identical. Combined unchanged-field SHA-256: `c44c9222965d04f8a422f98152f01948fdd211780c3a9f34e0f0e1e1c778673b`.
- All 120 committed package/web mesh copies compared against HEAD: only colors, materialIds and factionMasks differ. Skeletons, VAT/clip data, animated bounds, manifests and catalogs are unchanged.
- Placeholder `--check` passes. Loaded-bundle generator test passes all 20 appearances and 2,058,336 animated vertex-bound checks (maximum radius fraction 0.9166128302044211).
- Source GLB bundle test passes: 14 human/mounted pose samples, explicit uint32 merge, CLI and determinism coverage.
- Focused source TypeScript check passes. Full fresh-worktree typecheck remains an integration gate: generated wasm and migrated near material consumers belong to other owners.
- Material, skin and packing Vitest tests pass. The wider loader fixture initially failed because it combined new multi-slot meshes with an old singleton material table; its owner was notified to update the fixture, without relaxing validation.
- Independent Codex review `01a074c2-46d4-7702-a551-c23af391b228` found no source defect and requested two test invariants: material IDs must survive transport, and same-color wood/leather slots must have distinct scalar factors. Both assertions were added and rerun.

## Change ledger

All rows concern `web/tests/soldierMaterials.test.ts`. No simulation or unit-stat changes.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| soldier material identity publishes the canonical channel order | Pinned RGB-derived channel identity strings and albedo/normal/orm/factionMask metadata. | Removed dead source diagnostic test; material identity now belongs to the shared material owner. | The source builder no longer owns renderer channels. **moved** |
| soldier material masks decode placeholder albedo colors into PBR regions | Thresholds classified bronze/iron and blue faction pixels from RGB. | Explicit band test gives identical masks for blue and brown bands; ordinary blue remains mask 0 through transport. IDs, masks and colors round-trip exactly. | Color is no longer a material or faction identifier. **moved** |
| placeholder meshes carry bronze armor, iron blades, and one armband accent in cColor | Counted RGB-classified bronze/iron and exactly 24 blue accent vertices. | All 60 tiers reference declared slots; each triangle has coherent IDs/masks; all named surface roles are used across the roster. | Authored slot identity replaces RGB inference. **moved** |
| placeholder LODs keep faction to one armband, not shields or crests | Heavy sword and archer L0/L1 had 24 inferred accent vertices; heavy sword L2 had 0. | Every appearance has 24 explicitly masked band vertices in L0/L1 and 0 in L2; concrete heavy-sword band vertices bind to right arm at the band height. | Broadens retained band behavior to the whole roster without changing geometry. **moved** |
| soldier PBR constants keep metals glossy and cloth/leather rough | Iron metalness > bronze; iron roughness < bronze < leather < linen. | Same ordering is asserted against authored table entries, with cloth replacing the old linen label. | Actual material slots own scalar responses instead of shader diagnostic constants. **moved** |
| faction identity follows the authored band even when it is not blue | Tracer failed with 0 masked vertices versus expected 24 before implementation. | Passes 24 actual band vertices regardless of palette color. | Builder now writes the existing explicit mask channel. **moved** |
| placeholder palette converts sRGB to linear once, preserving alpha | New test; no previous transfer-function assertion. | 0.5 converts to approximately 0.21404114; 0.02 to 0.0015479876; 1 and alpha stay 1. | Canonical colors are linear; conversion occurs only at the historical palette boundary. **moved** |
| identical brown palette colors can author wood or leather independently | New test; wood inherited a brown palette that RGB classification could treat as leather. | Equal RGBA values use different slots with different roughness/metallic factor tuples. | Substance is explicitly authored separately from color. **moved** |

## Choices handed to the plan owner

Seven shared named slots use white base-color factors, leaving the converted palette in vertices. Heavy placeholder bodies remain bronze, medium bodies leather, others cloth; that is a temporary placeholder interpretation, not a commitment about final chainmail art. Shafts use wood despite sharing leather's brown palette; gray bow strings use cloth. These choices are reversible by authored appearance replacement and add no new runtime format or external dependency.
