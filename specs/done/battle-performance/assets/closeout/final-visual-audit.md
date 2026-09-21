# Independent visual audit

Inspected the user tactical reference, both tactical full captures and all four supplied front/middle crops, then both forest full captures and both crown crops. Visual inspection only; no source-code assumptions or old placeholder baselines.

## Tactical

- **Army detail retained; high confidence, full views and crops.** Distinct heads, arms, legs, skirt/armor shapes, weapons, blue shields and banner symbols remain legible. Dense infantry, sparse ranks and the pike block read as different formations. No obvious missing body sections, floating banner panels or gross depth-order failures in these captures. The supplied reference has a lower pixel resolution, so this establishes comparable visible content, not exact fidelity at matched native resolution.
- **Default provides visibly stronger grounding than off; high confidence, both scales.** Shadows connect to the feet and run consistently across the ground. The off capture leaves feet relatively isolated against the bright field and gives the sparse ranks a more cut-out appearance. Default ranks and their depth are easy to scan at the reference-like framing.
- **Default shadow repetition forms conspicuous horizontal bands; high confidence in presence, medium confidence as a quality defect.** In the front crop, long overlapping shadows become near-continuous stripes along the ranks; shadows also extend beyond the right edge of the middle formation in the full capture. They are coherent with a low light angle, but their regularity competes with the individual soldiers and looks more diagrammatic than natural. This is a refinement opportunity, not evidence of absent shadows or broken grounding.
- **Ground detail still competes with tiny silhouettes; high confidence, both scales.** Dense dark ground speckling approaches the thickness of distant legs and weapons. It reduces fine silhouette separation, especially in sparse rear ranks. This limitation is also visible in the user reference and is not established as a new regression here.
- **Pike shafts become a dense fine-line screen; medium confidence, full capture.** The right-hand block is recognizable, but overlapping shafts dominate its upper silhouette. A dedicated pike crop would be needed to judge individual attachment/aliasing beyond this general readability limitation.

**Tactical verdict:** default visibly meets the broad reference's army-detail and formation-readability bar and supplies clear grounding. The evidence does not justify calling the image flawless: repeated shadow bands and busy ground texture remain visible quality limitations. Off is visibly weaker for grounding.

## Forest

- **No one-sided forest visibility loss is apparent; high confidence at supplied scales.** Source and TypeGPU show the same green footprint, visible point-like trunk/crown remnants, long dark tree-shaped shadows and exposed troop formation in the same locations. Neither full pair nor crown pair reveals a clear missing feature on only one side.
- **Both have weak canopy readability; high confidence, full and crop.** The forest reads primarily as a flat green patch covered by long shadows and small scattered dark marks. Broad, volumetric crowns are not readily visible from this overhead framing; the shadows communicate trees more strongly than the actual tree silhouettes.
- **The patch edge is conspicuously stepped near the crown's top; high confidence in the crop.** Both sides share the same blocky boundary. The embedded soldiers remain bright and readily visible, but the capture alone cannot determine whether that visibility is intended occlusion behavior.

**Forest verdict:** these captures support visual parity between the two paths, with substantial shared limitations in overhead forest presentation. They do not support a claim that TypeGPU uniquely removed the crowns, nor that the shared forest rendering is visually satisfactory in an absolute sense. A lower-angle capture would be required to separate overhead silhouette limitations from missing crown geometry.
