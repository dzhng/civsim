# Checked image upload and mip generation

This is numerical resource/sampling acceptance, not surface-art acceptance.
The integrating04b pass owns decoding, material binding and production reload.

## Boundary

`uploadImageTexture` accepts a caller-owned decoded image and actual GPU device.
It uploads original dimensions without a canvas, CPU readback or repacking.
The caller keeps ownership of the bitmap and receives ownership of a complete
GPU texture only after admission. Failed construction destroys the partial
texture. Source bytes remain with the catalog for independent consumer rebuilds.

GPU error scopes are popped before awaiting their results, excluding unrelated
frame work. Synchronous image-copy exceptions and asynchronous GPU validation,
internal and allocation errors all reject preparation.

## Mip decision

Every mip texel is the area-weighted mean of its footprint in the previous
level. This includes the last row/column of odd dimensions and one-pixel axes.
Base-color sampling decodes sRGB before averaging; writing the sRGB attachment
encodes the mean. Data channels remain linear. Every stored level has ordinary
8-bit quantization; alpha is averaged as a linear channel. This does not promise
coverage-preserving cutout mips or a renormalized normal-map chain.

No pipeline cache or asset manager is added. A single pipeline is reused for
all levels of one upload. Admission correctness precedes speculative caching;
the integrating startup/resource gate can justify a per-device cache if needed.

## Verification

Run `bun run --cwd web test imageTexture` and `bun run --cwd web typecheck`.
With Vite serving this worktree, run from `web/`:

```sh
VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5183 node scene.mjs image-texture
```

The scene uses the existing runner's GPU launch policy and a blank isolated page,
not a scene claiming visual quality. It reads all generated GPU mip levels and
compares against an independent CPU area-integration oracle, including odd,
rectangular and one-pixel dimensions. It checks ordinary linear ORM bytes,
Three ExternalTexture color conversion, filters, wrapping, explicit and implicit
mip selection, actual dimensions, bitmap lifetime and wrapper/GPU ownership.
Only the GPU boundary is intercepted for failure injection; creation/upload and
rollback still run through the actual helper and device.

Independent review found no helper correctness defects, but flagged the initial
standalone probe as missing automatic-suite wiring. It is now an addressable
scene using the canonical runner/check reporter; the integrating pass adds its
name to the renderer suite. The final negative cases separately prove a thrown
copy exception, GPU destination-bound validation, and a mismatched mip render
attachment. All reject and destroy the partial allocation while retaining the
caller-owned bitmap.

Mutation proof: replacing footprint normalization with a fixed divisor of four
fails odd and thin mips (up to175 byte levels in the1x5 chain). Restoring area
normalization passes; tolerances were not widened.

## Choices and ledger

- **Sound, medium confidence:** area-weighted reduction instead of a center
  bilinear sample. When a5-pixel-wide image becomes2pixels, both destination
  pixels include their share of the middle source texel rather than dropping
  edge content. Future consumers share this mip policy. Exact filter choice was
  delegated; the preserved full footprint is the load-bearing property.
- **Sound, medium confidence:** retain COPY_SRC on the returned GPU allocation.
  A verifier or GPU-to-GPU consumer can inspect/copy the actual resource without
  rebuilding it. This adds a usage capability, not an extra allocation or live
  readback. Sampler policy remains with the consumer.
- **Sound, high confidence:** caller owns bitmap closure. Two consumers of one
  encoded catalog decode independently, so preparing/discarding one cannot close
  the other's upload input. There is no shared decoded-image cache.
- **Sound, medium confidence:** no pipeline cache until startup measurements
  justify one. Repeated uploads may compile equivalent pipelines; avoiding a
  cache also avoids retaining invalid pipeline objects after failed admission.

New tests (previously absent): closed/oversized-image rejection before allocation;
successful GPU ownership handoff; synchronous and scoped failure cleanup; mip
values and Three binding/ownership. Existing tests and screenshot baselines do
not change. Production integration remains required before04b can pass.
