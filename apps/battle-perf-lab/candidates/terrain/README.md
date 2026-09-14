# Native playable terrain and opaque horizon

This component submits the production ground and horizon vertex/index arrays
through native WebGPU. Its pure WGSL material uses the shared turf/water policy,
RG8 signed earth distances, canopy noise, terrain slope response, and on-field
water. The original on-field water applies a linear transfer inside its surface
function and again after mixing with turf; this port preserves both conversions.

The camera belongs to `renderer-core`; the environment owns sun, PMREM/DFG and
atmospheric lighting. The terrain owns only geometry buffers, the earth-distance
texture and a small state uniform. It encodes into a borrowed HDR/depth pass,
with reverse-Z depth and the same front-facing winding as production. Normal
variation supplies the geometry-roughness derivatives before PBR evaluation.
Its scalar shadow input attenuates the sun; shadow-map construction and spatial
shadow sampling remain separate work.

This is a base scene component, not a complete environment or benchmark backend.
Background quads, vista terrain, ocean/lake planes, grass blades, scenery and
shadow-map generation are excluded. The on-field water patch is included. The
horizon layout can contain ocean-plane specifications; this component deliberately
submits only its opaque mesh, so its caller still must render those ocean planes.

[The control](check.ts) renders actual production Three ground/horizon materials,
first as albedo/roughness and then with the real sun, PMREM and aerial perspective.
It compares HDR arrays before post, across all presets, three camera poses, and
with/without horizon. Shared geometry includes mud/road feathers, scree, rock,
water and varying slopes. The odd framebuffer exercises padded readback. The
[recorded acceptance results](evidence/terrain.json) retain strict failures rather
than masking coplanar pixels. Material and beauty absolute diagnostic limits are
0.001 and 0.005 respectively; exact coverage and finite output are mandatory.
The recorded ground gate passes (material maximum 0.0007324; beauty maximum
0.0046387), while the full horizon gate remains red. Nine pixels in the grazing
view select the alternate wall-bottom face under every preset. Every recorded
large error includes a ray/triangle localization to the two source caps and their
authored colors; no pixel-count exemption is applied. Coverage matches exactly.
These diagnostic limits grant no permission to replace material detail or lower
quality.

The [separate projection diagnostic](evidence/terrain-canonical.json) is invoked
with `?canonical`: it changes only the reference's vertex projection to the
canonical combined matrix. It cannot replace the actual-production acceptance
control. The horizon wall has overlapping base/body bottom and end caps at
effectively the same Z or Y plane, with different colors; tiny projection/compilation differences can choose
different fragments at that authored coplanar overlap. The native clip output is
invariant across its material/beauty pipelines. Geometry and depth bias remain
unchanged.

The larger [readable-horizon control](evidence/terrain-visual.json), selected with
`?visual`, uses 1025×769 pixels. Its strict gates also remain red: 67 pixels select
the other source wall cap, plus two material-detail pixels exceed 0.001 and one
beauty-detail pixel exceeds 0.005. The largest unlocalized difference is 0.0119629
at pixel (984,499); the matching material difference is 0.0076904 with unchanged
roughness. These ground-detail differences still need input/derivative/precision
investigation. The control counts every failing pixel, classifies source cap hits,
and retains a bounded list of the worst 16; it grants no classification-based
exemption. No full scene or game-appearance parity is claimed.

Paired `golden-*-raw.png` / `golden-*-three.png` files in `evidence/` show the HDR
arrays through the same already-controlled native post transform. They are
partial-scene diagnostic captures, not a full beauty or performance verdict.

Start `bun run --cwd web vite --config vite.terraincheck.config.ts --host 127.0.0.1
--port 5199`, obtain the coordinated GPU slot, then run
`node apps/battle-perf-lab/candidates/terrain/verify.mjs`. Set `TERRAIN_CHECK_URL`
to select another port or the explicitly separate projection diagnostic.
