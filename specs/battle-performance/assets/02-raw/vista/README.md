# Native vista composition

The native terrain owner now draws the shared completed outside rings. Ordinary
vista terrain retains the source roughness floor and does not receive shadows.
The far-fog ring uses the source view-ray opacity ramp, straight-alpha blending
and disabled depth writes; depth testing still places it behind nearer terrain.
The same owner renders playable terrain with its original default shader and
pipeline settings. No extra terrain generator or scenery representation is added.

The actual Three control and native frame share a playable patch, a 4,344-triangle
near vista and 3,968-triangle far ring, sky and real post-processing. Overview,
horizon and repeated horizon views each run plain and bloom at one/four samples.
All twelve cases pass the existing 1/255 maximum-channel gate: maximum HDR error
0.002930 in overview and0.000977 at the horizon. Both runs have zero nonfinite
values, GPU/browser errors and retained candidate textures after disposal.

[Independent still review](review/findings.md) finds continuous terrain, matching
skyline/depth/opacity appearance and no convincing open seam. Every display-channel
pair difference is at most one code; all eight repeated-horizon comparisons are
pixel-identical. Shared limitations include a pale left-ridge taper and stronger
single-sample silhouette stepping. The synthetic scene proves this component,
not arbitrary generated maps, interactive camera timing, complete-world occlusion
or performance. Other backend vista material/pass integration remains open.

The raw TypeScript project, dedicated build and independent source review pass.
The shared CPU geometry extraction has separate exact-data/raycast evidence in
[the data checkpoint](../vista-data/). The build disables public asset copying.
Use `vista.vite.config.mts` and the common frame verifier with
`FRAME_CHECK_URL=http://localhost:5200/vista-check.html` (append `?samples=4`).
