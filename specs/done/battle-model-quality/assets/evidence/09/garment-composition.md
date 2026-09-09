# Garment-only composition probe

The two editable garment objects can be transplanted into the retained heavy
assembly without replacing the newer hands, helmet or motion. The temporary
composition was strictly baked but **not promoted or visually accepted**.
The donor's current collar/shoulder construction and moving belt interference
still require correction before integration.

The source is the root heavy GLB with SHA256
`3c53bc08ba7d4e9f4066e89c23d0d383a03afb9dd945bf2c2375423b4f9431b7`.
Replacing only the modular `Tunic` and `Mail shirt`, retaining their root material
slots and re-exporting through the shared forward-basis helper produced
`a1d4e6c569fbf485c577fb568cf024fa984056aad98fb5442099ca0f33f15f5c`.
This used garment diagnostic16, not the final donor. The retained assembly has
33 other source parts.

The [parsed export controls](garment-composition-controls.json) preserve the full
rig and action data exactly.
For all six non-garment material primitives, positions, normals, UVs, weights,
joints, indices, colors and faction masks are exact. Re-export changed eleven
tangent scalars: seven skin, two leather and two bronze, maximum absolute delta
0.00010001659393310547. This is not byte-identical export parity.
The ordinary strict appearance bake completed successfully for all three
provisional tiers. Neither these checks nor the unchanged actions prove the new
garment's visible deformation or clearance.

Integration must repeat these controls using the final donor and then capture
the combined soldier. No root source, generated asset, production catalog,
runtime code or snapshot baseline changed during this probe. The saved modular
assembly remains the composition source; rebuilding all equipment procedurally
would perform a new fit and is not an equivalent export.
