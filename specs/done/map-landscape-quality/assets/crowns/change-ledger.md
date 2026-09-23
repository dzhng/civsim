# Slice 06A change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| tree-canopies | Five coarse families used joined ellipsoid/cone objects, with alternating dark lobe colors. | Connected crowns use one species albedo and deterministic shape variants. | The shared geometry replaces the coarse approximation. **moved** |
| shared-prop-models / trees | Detailed trees were sparse branch-generated leaf clouds. | Detailed foliage grows from the same crown envelope used at distance. | Stable coverage prevents near/far shapes from disagreeing. **moved** |
| shared-prop-models / conifer | Recursive branches and needles; the family camera could crop its tip. | Continuous pointed crown and denser surface needles; the tree camera frames the complete silhouette. | Shared crown ownership and review framing. **moved** |
| shared-prop-models / broadleaf | Sparse tall branch crown. | Broad olive crown with attached close foliage. | Match the reference's clustered volumes. **moved** |
| shared-prop-models / ash | Sparse branch crown. | Taller blue-green lobed crown. | Preserve the family distinction within the shared generator. **moved** |
| shared-prop-models / aspen | Branch-generated pale-barked tree. | Narrow light crown over the pale trunk. | Shared representation; foliage/trunk presence thresholds remain unchanged. **moved** |
| shared-prop-models / bush | Small branch-generated scrub. | Low filled crown with close detail. | Shared representation; foliage presence threshold remains unchanged. **moved** |
| campaign-landscape / Alps | Existing real campaign region with spike crowns. | Same terrain, camera and placements; shared crown geometry and world-coordinate variants. | Confirms model changes reach a consuming world. **moved** |
| campaign-landscape / Italy | Existing real campaign region with spike crowns. | Same geography and placements, new crown representation. | Confirms the second region consumes the same owner. **moved** |

The family tree camera changed from zoom 54 to 45 to avoid clipping the full
conifer; stone/cart cameras are unchanged. All existing numeric content floors
remain unchanged.

New tests pin closed-crown coverage under close detail, per-tree projected
selection, steady-frame uploads, constant draw work across variants, and
renderer cleanup. The new browser sequence checks coverage at both map pitches
and exact return to prior zoom frames, with a looping GIF for each pitch.

## Preserved carried-in failures

No non-tree PNG re-pins are included. With all changes stashed, the cart,
rocks and mountain sheets already differ from their committed baselines;
[pristine controls](pristine-controls.json) record the measured values.
Their current baseline failures are preserved for the integrator's baseline
audit, not attributed to tree work.

The hardware production default-battle gate fails its marker/impostor
expectation on pristine c20af951 (`markerLayer: none`, `impostors: 0`). The
batched crown candidate retains that same failure. Both pristine and candidate
submit 54 draw calls, meeting the unchanged <64 gate. A rejected separate-variant
implementation used 74; batching resolved that regression rather than changing
the limit. Unit LOD is outside this pass.


## Slice 06B checkpoint

The six detailed family snapshots, the physical tree contact sheet, both
near/mid/far zoom sequences and the two campaign regions intentionally change:
smaller distributed foliage now uses crown normals, giving continuous volume
lighting. Close triangles rise from 1,607 to 2,647 per tree while coarse crowns
stay at 567 and family/detail draw buckets stay unchanged. The coarse model sheet stays unchanged. Snapshot names, content floors,
coverage floor, clock, camera and terrain are unchanged. The previous close
control is retained as `close-before.png`; changed pixel counts are measured in
`changed-shots.json`. Non-tree baselines remain untouched.
