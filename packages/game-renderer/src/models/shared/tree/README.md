# tree — vendored procedural tree generator

Vendored from [ez-tree](https://github.com/dgreenheck/ez-tree) (MIT, Daniel
Greenheck), ported to three-free TypeScript and reduced to pure geometry: the
recursive branch-skeleton + leaf-placement algorithm, its options, and the
upstream presets. Upstream's THREE.Group/material/texture/wind/trellis layers
are dropped — civsim trees are vertex-colored `MeshData`, and the adapter
(`../ezTreeMesh.ts`) owns frame conversion, scaling, and color.

The port is seed-faithful: RNG call order matches upstream, so a given
(options, seed) grows the same tree shape as the original library.
