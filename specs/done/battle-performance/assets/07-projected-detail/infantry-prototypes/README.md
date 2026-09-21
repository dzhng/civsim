# Independent infantry prototype provenance

Claude Opus builds scratch 2k/4k intermediates from the existing fitted heavy-sword
and light-spear assemblies, using the shared reducer's near mode to retain small
components. All four pass mesh-LOD rig/material/UV/skin invariants. Skeleton,
animation, materials, images and original near/far files remain byte-identical;
root separately verifies the copied appearance files against this worktree's
production catalog. Exact source/GLB hashes and triangle counts are in the proofs.

These are prototypes only. The scratch catalogs insert an intermediate in the
middle slot while preserving the old near/far; final adoption must evaluate the
whole chain and boundaries. No production asset, source assembly or policy is
changed, and invariant success does not prove visual or performance equivalence.
