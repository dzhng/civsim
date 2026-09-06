# Local animation transport

Prepared producer/loader work in `codex/local-animation-cutover`; integration
with both GPU consumers is still required before this is a usable runtime.
This is source-data verification, not visual or performance acceptance.

The JSON transport stores authored-time local T/R/S samples and STEP masks.
`LocalAnimation` owns decoding to Float32/Uint32 storage. A load transaction
caches decoded animations by resolved URL, so appearances sharing an animation
also share its resource identity. Reload creates a fresh generation. Invalid
sample lengths, clip ranges/times, masks, Float32 values and non-unit rotations
are rejected before installation; the matrix-animation format has no reader.

CPU mesh posing now accepts contiguous derived joint matrices, independent of
animation encoding. The source glTF importer, complete appearance producer,
placeholder producer and all23 appearance assets use the local format. No
geometry, material, authored channel, loop or marker was changed. Removing the
old matrix baker also removes its sampling-rate option; interpolation follows
authored times rather than a caller-selected frame grid.

## Source evidence

`bun run --cwd web bake:test` passes the entire source gate, including the
newly registered local encoding and migrated hierarchy tests. The original
8,302,608 source/decoded vertex comparisons retain maximum error
1.8506258364033728e-6m;86,400 mounted comparisons retain2.388837865275353e-7m.
The actual HTTP-loaded human/mounted Blender oracle checks retain their
original tolerances, with maxima3.909125147448636e-7m and3.615106059319868e-7m.
The six-material oracle maximum is3.8015516667271555e-7m.

The focused appearance loader, timeline, mounted timeline, playback packing
and weighted skin suites pass41 tests. Whole-app typechecking awaits the
separately owned raw/Three consumer changes; it is not reported as passing.

Independent full-tree review correctly identified that this isolated staging
tree cannot run until its consumers are migrated; these changes must be applied
to main together. Verification-only absolute dependency/WASM symlinks are not
part of the commit. A subsequent focused producer/loader review found no
actionable defects. Shape review retains one local encoding owner and one
matrix-independent weighted skinning owner; no compatibility adapter remains.

## Changed-test ledger

| Test family | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Local hierarchy (formerly VAT) | Fixed-frame matrix texture layout plus hand-computed hierarchy | Authored-time local layout plus the same bind, half/final rotation and ancestry checks | Old transport removed; geometric tolerances unchanged |
| glTF, engine basis, appearance, material swatches | Oracle seconds quantized to matrix frames | The same oracle seconds decoded from local samples or evaluated from source | Verify replacement encoding without retaining old sampler |
| Weighted skin and packer | Single-frame texture-shaped wrapper | Contiguous derived palette | One skinning owner independent of storage format |
| Appearance admission | Malformed matrix dimensions rejected | Malformed local samples rejected; shared decoded identity and fresh reload generation pinned | Atomic replacement contract |
| Bounds and placeholder surface sweeps | Uniform baked matrix frames | Same12/24Hz admission times retained, plus authored keys; bounds still analytic | Source validity coverage must not shrink with a smaller animation payload |
| Presentation motion | Uniform-frame local pose checks | Authored-time local pose checks in the declared layer | Every authored motion key is inspected, including short actions |
| Timeline fixtures | Animation texture start/frame fields in test metadata | Only semantic name/duration/loop/marker fields | Controller does not own GPU addressing; action behavior unchanged |

The final GPU rounding envelope, mesh/shadow parity, resource failure cleanup,
temporal negative control and hardware gates remain06/07 obligations.
