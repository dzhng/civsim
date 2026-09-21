# Raw world checks

The world these check now lives in [its own package](../../../../packages/battle-renderer/README.md);
what remains here are its checks, preflight pages and lab-side control backends.

The preflight check verifies native compute-to-render storage visibility and
pipeline-specific bindings with a shared uniform buffer and with distinct uniform values. Readback
checks both computed values and one rendered pixel. The function borrows its
caller’s device and destroys only its own buffers/textures; the page owns device
creation and disposal.

Build from `web` with `bun run vite build --config vite.raw.config.ts`, serve that
configuration with Vite preview, then run `node apps/battle-perf-lab/src/raw/verify.mjs`
from the repository root. `RAW_PREFLIGHT_URL` selects the served `preflight.html`.
Build output stays in ignored scratch; the verifier saves its explicit API verdict
under the spec’s evidence folder.

The post pass consumes the same renderer-independent policy as the
production chain and encodes five-level HDR bloom, grade, AgX and one sRGB transfer.
Its [numerical control](../../candidates/raw-post/README.md) exercises actual Three
output, including bloom toggles and disposal. The caller supplies the scene image,
validated grade parameters, output target and command submission. Recreate the
pass when its input or framebuffer changes.

There is no complete battle scene or performance result here. API and component
checks do not establish full fixture parity or qualify this backend for ranking.

The [water component control](../../../../specs/done/battle-performance/assets/02-raw/water/README.md)
compares real ocean displacement and inland water with shared CPU topology and
surface policies. Water owns geometry/state buffers and borrows the frame's
camera, environment and reverse-Z attachments. Its opaque depth writes belong
before read-only world decals. Ocean numerical parity remains explicitly open.

[TypeGPU/vgpu water controls](../../../../specs/done/battle-performance/assets/02-preflight/water-ports/README.md)
share the source fixture and water shader bodies while each runtime owns its
resources and draw submission. Their replacement/failure probes check cleanup
without destroying the borrowed device; ocean's strict numerical gate remains red.
