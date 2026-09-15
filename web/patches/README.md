# Renderer lifetime patch

Three's shared DFG texture and quad geometry can outlive a renderer. Their
resource listeners must not keep a disposed renderer alive or disturb another
renderer still using those resources. This patch makes the owning texture and
render-object managers detach their listeners at teardown, following Three's
existing geometry-manager pattern. Ordinary resource disposal removes its own
registry entry; bulk teardown does not release GPU state after backend disposal.

Bun applies the patch declared in `web/package.json`. It covers the dependency
source and the non-minified WebGPU bundles, including the application's exported
`three/webgpu` entry. Unused minified direct-import variants are not patched.
Remove it when an upstream version releases these same listener roots and passes
the CPU ownership regression plus campaign/battle collection and memory cycles.

The [retirement evidence](../../specs/map-landscape-quality/assets/slice-15-retention/README.md)
records the retained heap paths and the production collection/memory control.
