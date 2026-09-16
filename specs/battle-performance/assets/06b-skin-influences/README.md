# Skip exact-zero skin influences

The production Three crowd helper and the common native soldier vertex body load
four palette matrices unconditionally. The authored infantry sample mostly uses
one or two nonzero influences; weight-distribution.json records exact source-mesh
hashes and counts. The CPU skinning reference already ignores exact-zero weights.
This motivates a shader control, not a measured speedup.

The isolated Claude pass keeps the first weighted matrix, then conditionally
loads/adds each subsequent matrix when its weight is nonzero. It retains order,
finite weights, noncontiguous zero slots and a possibly zero first weight. No
asset, animation, pose or quality policy changes. Compiler control flow, numeric
GPU output, complete pixels and actual cost must all be verified before adoption.
Branch divergence or predication may erase the apparent source-level saving.

The root prepares twelve frozen production-asset before-images across sword,
phalanx and cavalry ready/attack/run/death poses, plus actual generated shader
modules. A new numerical scene checks the real Three helper against weighted
matrix columns, including gapped influences and a single weight slightly below
one. The unmodified shader passes all eighty RGB-encoded float checks; material
alpha is deliberately excluded from data transport because opaque output owns it.
This reference is not the optimized implementation's acceptance result.
