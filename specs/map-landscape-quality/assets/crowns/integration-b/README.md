# Crown refinement in the shared terrain worktree

The merged refinement passes 454 tests and TypeScript. All shared tree-family and both map-pitch zoom/return captures match the delegated baselines exactly under decoded RGBA comparison. Coverage and representation-return assertions remain unchanged. Non-tree snapshots are not refreshed.

The current campaign surface requires two intentional merged baseline updates: Alps 11,566 pixels; Italy 5,811 pixels. The diff images localize the change to foliage, caused by coherent crown-normal leaf shading and front-facing visible geometry with double-sided shadows. Geometry, coast and placement were unchanged in this merge. Both updated regional captures repeat with zero changed RGBA pixels. The original baseline parent is `af2fe354`.

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| landscape-alps | Image at af2fe354 | 11,566 changed RGBA pixels | Integrated crown surface/visible-side correction. **moved** |
| landscape-italy | Image at af2fe354 | 5,811 changed RGBA pixels | Integrated crown surface/visible-side correction. **moved** |

The delegated crown ledger records all model baseline updates. This checkpoint does not close slice06's remaining silhouette critique or slice07's regional scale/placement work.

Fresh merged critique finds the candidate marginally less wrong on regional silhouettes, with no new coverage holes, missing crowns or obvious floating trees. Native battle pitch keeps clear volume and trunk attachment. Enlarged crops still show minor detached leaf fragments; campaign pitch hides the trunk, so that view cannot independently prove attachment. Weaker internal lobe separation remains a reference gap. These residuals stay with slice06.
