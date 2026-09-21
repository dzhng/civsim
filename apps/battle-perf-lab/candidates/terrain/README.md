# Terrain comparison evidence

The Three ground/horizon comparison belongs to pinned Git revision
`16ad724514eeb840f241917c8fedb437a52ac1e3`. Reproduce its control in an isolated
checkout of that revision; it depends on the Three battle owner retired from the
active tree.

The [raw](../../../../specs/battle-performance/assets/02-raw/terrain/),
[TypeGPU](../../../../specs/battle-performance/assets/02-typegpu/terrain/) and
[vgpu](../../../../specs/battle-performance/assets/02-vgpu/terrain/) archives retain
the numerical and image evidence, including unresolved coplanar horizon and
multisample beauty differences. These partial-scene comparisons do not establish
full-scene appearance or performance parity.

Current terrain rendering belongs to the
[production TypeGPU world](../../../../packages/battle-renderer/src/world/terrain.ts).
Raw and vgpu scene comparisons consume archived inputs through the lab's
[replay build](../../src/replay.vite.config.mts).
