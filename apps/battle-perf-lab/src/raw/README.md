# Native API preflight

This verifies native compute-to-render storage visibility and pipeline-specific
bindings with a shared uniform buffer and with distinct uniform values. Readback
checks both computed values and one rendered pixel. The function borrows its
caller’s device and destroys only its own buffers/textures; the page owns device
creation and disposal.

Build from `web` with `bun run vite build --config vite.raw.config.ts`, serve that
configuration with Vite preview, then run `node apps/battle-perf-lab/src/raw/verify.mjs`
from the repository root. `RAW_PREFLIGHT_URL` selects the served `preflight.html`.
Build output stays in ignored scratch; the verifier saves its explicit API verdict
under the spec’s evidence folder.

There is no battle scene, shadow pipeline or performance result here. This is a
healthy native API control for the library preflights; full fixture parity is the
next independent obligation.
