# Provisional heavy surface candidate

This is an editable local Blender material study over frozen provisional heavy
geometry, not slice10 acceptance. Geometry, source weights and rig match the
retained clay source; its hash and independent source comparison are recorded in
[source-check.json](source-check.json). Later anatomy/equipment changes require a
refit. The production catalog is unchanged; identical candidate tiers do not
constitute LOD acceptance or a measured resource envelope.

## Authored source and integration

The [surface module](../../../../../packages/soldier-assets/bake/blender-heavy-surfaces.py)
owns the original analytic texture motifs, explicit material slots, UV placement
and faction mask. The shared atlas carries sRGB albedo, linear tangent normals,
and packed AO/roughness/metallic; it uses the existing slice04 contract. Mail uses
a torso wrap, planar collar and arm-axis sleeve mapping so smart-project island
packing does not determine link size. Other parts retain source UV islands inside
their material tile, with padded edges. Region transitions and physical texel
density across limbs and shoulders remain unresolved visual defects.

The minimal integration is to import the module and call
`author_surfaces([body] + gear)` immediately before the geometry owner's existing
export-copy join. Export through `anatomy.export_candidate`; its explicit
`export_attributes=True` carries `_FACTION_MASK`. No other export policy belongs
to the surface module. Keep surface candidate generation separate from clay
geometry acceptance. The [frozen fixture driver](build-candidate.py) reconstructs
this particular comparison from the retained input without regenerating anatomy
or equipment geometry.

The [editable source](../../../../../packages/soldier-assets/assets/source/heavy-surfaces/heavy-surfaces.blend)
keeps original separate parts and the joined export copy. Locally generated PNGs,
GLB and provenance sit beside it. The baker creates a clay control with the same
mesh attributes, rig and animation; only material response and faction masks
differ. It shares animation and skeleton references rather than creating a second
control rig.

## Reproduction and checks

Run from the repository root, with the existing verification server serving this
checkout. The source driver consumes its retained `clay-input.blend` by default:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python specs/battle-model-quality/assets/evidence/10/build-candidate.py
node packages/soldier-assets/bake/heavy-surfaces.mjs
node packages/soldier-assets/bake/heavy-surfaces.mjs --check
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python specs/battle-model-quality/assets/evidence/10/source-check.py
node --test packages/soldier-assets/bake/appearance-materials.test.mjs packages/soldier-assets/bake/material-swatches.test.mjs
VERIFY_GPU=1 VERIFY_URL=http://localhost:5178 node web/scene.mjs heavy-surfaces
```

The scene owns fixed camera/viewport/pose values and paired clay-left/surface-right
stills through `snapCheck`. It checks another rendered frozen frame for exact
stability, real production submission and a nonzero visible material change. Its
[active baselines](../../../../../web/shots/models/shared/soldiers/heavy-surfaces)
include full-body front/rear, gameplay pitch, native material/hand detail and a
small formation. Production daylight is unchanged. No new motion is authored.

## Review record

The [first front](first-pass/front.png) and [first mail close-up](first-pass/mail.png)
were rejected: the large bright hexagonal relief read as embossed scales and
the full shield tint read as synthetic purple. Subsequent source work darkened
and reduced mail links, retained hide/wood as the main shield surfaces, and used
an authored faction border. A clamped rear unwrap initially produced a stretched
strip; the periodic motif now continues through its gutter instead of collapsing
seam triangles.

An independent visual critique rejected the intervening candidate for radial
neck stretching, flat sleeve waves, embossed honeycomb instead of linked mail,
and a glossy gradient shield with regular wooden corrugation. The retained latest
candidate separates collar/sleeve mapping, uses overlapping tilted wire motifs,
and authors irregular wood grain and rough hide. Author inspection still finds
visible mail mapping boundaries, inconsistent link directions and full-body
moire; the shield hide is too broadly wavy and the faction border is soft.
Cloth/leather remain uniform and metal wear insufficient. These changes are a
provisional study, not a claim that the critique is resolved.

The [capture check](capture-check.txt) records seven exact repeat baselines with
production submission and no page errors. The [transport check](transport-check.txt)
passes the existing appearance/material fixtures; the source comparison records
unchanged geometry, weights, transforms and rig. The [image comparison](comparison.json)
measures change from the rejected first pass, not closeness to acceptance:
grayscale MAE is 1.19509 for the paired front and 13.44731 for the paired mail
close-up. Its diagnostic images are regenerable scratch output, not retained
acceptance artifacts.

The main-agent source review found duplicated glTF export policy; it was removed
in favor of the shared anatomy exporter. It also identified the rear seam clamp
and the need to inspect shoulder density. The independent CLI review could not
run: Codex CLI0.144.4 rejected configured `gpt-6-astra` as requiring a newer
client. This is a recorded missing review, not a passing verdict.

Material quality, physical texture scale, leather seams/wear, and integration onto
accepted geometry remain open. Existing garment drape, anatomy, grip contact,
motion, LOD and resource-envelope defects remain with their owning slices.
