# 06 — Shared tree crown representation

Status: complete. Depends on 01; regional planting and environment remain in 07/10.

## Contract

Both map pitches use the shared scenery registry and the same connected crown geometry. Close leaf surfaces add detail over that volume, so minification cannot hollow out a tree. Instance identity selects a stable variant; projected size chooses detail with hysteresis. Visible and shadow cutouts use one mask.

The accepted character is a solid, irregular canopy with readable lobes and connected trunks. Broad families use fewer main lobes; narrow aspen retains fuller coverage. Leaves intersect the crown instead of forming a loose fringe. Species dimensions and instance scale remain unchanged. Fixed geometry budgets and family/detail draw buckets are preserved.

## Evidence and acceptance

The family sheets and both map-pitch zoom/return sequences pass unchanged coverage gates. All 14 distinct tree PNGs repeat exactly over 18 capture calls, with frozen clocks and SwiftShader. The final merged code passes 464 tests and TypeScript. Independent code reviews found no actionable regressions.

Fresh native/crop comparison accepts the tree-form contract for simple matching character. The merged Alpine and Italian views also pass a separate unprimed review: coherent crowns, readable volume, no new holes or clear floating defects. Minor leaf fragments and scratchy conifer strokes remain acceptable simplifications at native size. Concealed trunks at campaign pitch do not prove detachment; visible battle trunks remain connected.

The final merged regional images change 273,845 Alpine pixels and 150,947 Italian pixels from the preceding crown checkpoint; differences are confined to foliage and its shadows. Both updated baselines repeat with zero changed RGBA pixels. No non-tree baseline or tolerance was changed.

[Final model evidence and ledger](../assets/crowns/finish/README.md) owns the family comparisons, rejected aspen trial and strict results. [Merged regional evidence](../assets/crowns/finish/integration/README.md) owns the final real-region verdict and changed-pixel ledger. Earlier comparison evidence remains under the crown report.

## Protected scope

This accepts tree form, coverage and attachment, not forest density, tree-to-mountain scale, ground clutter or landscape shadow extent. Those remain with 07 and 10. Campaign and battle keep their placement policies while sharing asset identity and drawing. Future asset changes must repeat the family and both-pitch consumer gates through the existing snapshot primitive, then use an unprimed screenshot critique before acceptance.
