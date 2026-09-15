# Offline atlas preparation evidence

The retained catalog contains only fixture classes 0, 3 and 6. Each decoded
property atlas occupies 9,437,160 bytes across three complete mip chains; compressed
payloads are approximately 584, 149 and 449 KB respectively. Full-catalog generation
is supported by the [authoring tool](../../../../packages/soldier-assets/bake/impostors/README.md)
but has not been performed or admitted here.

The final strict fresh-source check passed for all three classes. An earlier
unchanged-input class-0 check differed by sixteen single-code UNORM8 values:
three albedo, six normal and seven ORM bytes across levels zero through three.
No alpha byte changed, and the anchor/span matched exactly. The complete
[observed delta](source-self/observed-delta.json) and fresh payload remain separate
from the catalog. That payload was reconstructed losslessly from the original
stored bytes and all sixteen observed replacements; its content hash matches the
fresh hash recorded by the failing check. This is source-self GPU variation,
not permission to change a material or loosen a renderer gate. Fresh checking
still fails on any byte or anchor difference.

All three four-sample persisted-input renderer controls pass twelve cases each,
with exact coverage, maximum covered HDR error 0.000244140625, no console/GPU
errors, and zero live textures after backend disposal:
[raw](../02-raw/impostor/samples-4-offline/report.json),
[TypeGPU](../02-typegpu/impostor/samples-4-offline/report.json),
[vgpu](../02-vgpu/impostor/samples-4-offline/report.json).
Three samples the same persisted atlas bytes in these comparisons; fresh-bake
fidelity is reported separately. No new full-scene visual or performance claim
is made.

The artifact control exposed TypeGPU 0.12.5 ignoring typed-array offsets during
texture writes. The [pre-fix report](typegpu-packed-view-before.json) records the
resulting wrong mip/channel uploads. Copying only non-spanning input views at the
public texture-upload boundary restored the strict control. The runtime loader's
standalone build also rejects Three or photoreal-renderer imports; authoring and
runtime execute in separate pages.
