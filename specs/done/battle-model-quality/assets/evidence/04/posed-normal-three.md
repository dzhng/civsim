# Three posed-normal directional evidence

`battle-model-normal-frame` runs the production Blender-reference human through
the real crowd factory, VAT position shader, and far property-atlas preparation.
The diagnostic changes only near output to encode the existing production
fragment normal. Far measurements read the actual model-space normal atlas.
These are numerical property checks, not final-distance or aesthetic approval.

The oracle independently blends the source's four weighted matrices, transforms
and normalizes vertex N/T, ray-intersects the posed triangles, interpolates their
frames/UVs, Gram–Schmidt orthogonalizes T, applies authored W and decoded XY scale,
then compares directions. It does not call the production skin or surface helper.

## Controls and outcome

- Bent/yawed Blender human, mirrored W, scale 2, large finite Float32 scale,
  corpse roll, flat map, zero XY scale, and an unmapped slot pass near and far.
- A negative-Z map at zero XY scale still reverses N: zero scale is not a map
  bypass. A linear-filtered 127/128 checker at constant UV averages to decoded
  zero and returns geometric N through the real PNG upload path.
- Synthetic valid-vertex cards isolate exact and residual interpolation collapse
  of N/T. Front and back both retain the authored geometric orientation. The
  cards use identity VAT only for these analytical limits; human controls retain
  the authored Blender animation and geometry.
- Every directional check requires dot product >0.999. Spatial controls retain
  all four authored texel regions and at least 40 stable interior rays per tier.
  The bent/yawed case has 56 near / 123 far samples, minimum dots
  0.9999999984 / 0.9999879405. Constant-UV decoded-zero uses one texel region,
  170 near / 560 far samples, minimum dots 0.999996144 / 0.999969707.
- The previous implementation failed ten mapped near/far checks while zero-scale
  and unmapped controls passed. Residual-N without its interpolation floor
  returned an orthogonal direction (dot 0); removing only the residual-T floor
  returned dot 0.844535 front and back. Both mutations return to dot 1 after
  restoring their floors.

## Raster boundary and shader diagnosis

A single far pixel initially crossed a nearest texel boundary. An output-only
16-bit UV diagnostic retained the production bake's position and interpolation:
the independent ray gave UV (0.53845155, 0.74487719), while GPU interpolation gave
(0.53791104, 0.75182727), selecting the adjacent row across V=0.75. This was not
an alternative depth surface or a tangent/normal transform error. The final
probe requires the entire ray-derived pixel UV footprint to stay within one
nearest texel; it does not exclude a coordinate or accept a mismatched direction.
This criterion replaces a fixed fractional-texel boundary margin.

The mapped production lighting shader initially exceeded the baseline GPU's
inter-stage limit. After shared-position/scalar packing and removal of lazy
conditional node leakage, captured WGSL has 12 user varyings plus front-facing,
with weighted VAT/joint/weight/tangent input calculations remaining in the vertex
stage. Directional texture sampling and derivative fallback remain fragment work.

## Evidence boundaries

The far oracle checks the representative-pose model-space atlas, not a fake
close-camera LOD acceptance shot. Existing final-billboard transform and distance
gates remain separate. No atlas layout, material art, baselines, or tolerances are
changed by this scene. `battle-model-image-properties` replaces only its temporary
normal-inertness assertion with positive shading consumption; all base/ORM/AO,
sampler, rollback, allocation and screenshot checks remain intact.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `battle-model-image-properties`: near normal | Normal PNG capture exactly equals scalar capture | Requires >100 changed pixels; measured 7,440 (maximum channel delta 44) | 04c enables mapped production lighting; the independent directional scene pins its meaning. **moved** |
| `battle-model-image-properties`: far normal | Normal PNG capture exactly equals scalar capture | Requires >100 changed pixels; measured 8,243 (maximum channel delta 57) | 04c bakes mapped normals for production billboard lighting. **moved** |

The new directional scene adds coverage rather than changing an existing pin.
Its original mapped-path and interpolation-floor mutation reds are recorded
above. No unit statistics or existing image baselines moved.
