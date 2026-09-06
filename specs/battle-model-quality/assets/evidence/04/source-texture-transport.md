# Source texture transport

The source baker now produces the complete surface container required by 04b.
This evidence covers transport and numerical invariants, not rendered texture
quality, mip generation, posed normal maps, or consumer closure.

## Boundary and evidence

`bake/materials.mjs` owns glTF material admission, material-slot consolidation,
normalized sampler policy and exact embedded image transport. It consumes the
canonical material-usage-to-channel mapping; the appearance baker composes this
with unchanged geometry, skeleton, animation and bounds owners. Whole-GLB hashes
and per-slot source references no longer determine surface identity. Complete
source GLBs remain provenance.

The real Blender human checker produces a 462-byte PNG, SHA-256
`67aaa32a56b116e3f7930552583d3141d62001903cd8ff67cdadddd90e08d6ef`.
Its textured slot enables base color; the other slot remains untextured. The
sampler is nearest magnification, nearest minification, nearest mip selection,
repeat on both axes. These values match the actual source export. Absent sampler
fields follow the installed GLTFLoader's linear / linear-mipmap-linear / repeat
policy, not an invented nearest default.

The initial real-export tracer failed on the old material array, then passed on
the new container. Additional tests use real GLB bytes with controlled JSON
edits and an asymmetric 3×2 channel-coded PNG. They prove exact bytes and decoded
pixel ordering, independent metallic/roughness versus occlusion flags, normal
scale and occlusion strength, all six glTF minification modes, image-index
reordering across exports, and rejection of conflicting images/samplers,
unsupported extensions, UV sets, transforms, transparency and emissive use.

All focused commands passed from the worktree rooted at `2807000c`:

```sh
node packages/soldier-assets/bake/appearance-materials.test.mjs
node packages/soldier-assets/bake/appearance.test.mjs
node packages/soldier-assets/bake/gltf.test.mjs
node packages/soldier-assets/bake/engine-basis.test.mjs
node packages/soldier-assets/bake/vat.test.mjs
node packages/soldier-assets/bake/soldier-placeholders.test.mjs
node packages/soldier-assets/bake/soldier-placeholders.mjs --check
node packages/soldier-assets/bake/blender-candidates.mjs --check
```

The HTTP appearance test used the parent-owned new container loader as a
verification-only copy. It loaded exact encoded image bytes and sampler values;
human 4/mounted 10 Blender landmark samples checked 5,472/8,640 vertices with maximum
errors 4.3109514976479507e-7 m / 3.916562606680189e-7 m. The full placeholder check
covered 20 appearances and 2,058,336 posed vertices. Regeneration changed only
material container files and added the extracted human image: all existing mesh,
rig, VAT, source GLB, bounds and catalog files remained byte-identical. Generated
outputs and runtime copies are excluded from this source-lane commit; integration
must regenerate the owned package/web outputs with the new loader in place.

## Review

Independent Codex review `SOURCE-TEXTURE-TRANSPORT-04B`, session
`01a0751e-51b9-7d01-9f26-9ac8f33dab74`, found two issues:

- Accepted: nested image/sampler indices accepted numeric strings through array
  coercion. An explicit regression failed before the fix; image, sampler and image
  buffer-view references now require nonnegative integers. The focused transport
  and HTTP appearance tests passed again afterward.
- Dismissed: reject double-sided materials. The task explicitly allows existing
  double-sided Blender fixtures under the renderer's retained policy; rejecting
  them would violate this pass's envelope. No new per-slot culling claim is made.

The reviewer could not bind its HTTP test server inside its sandbox. The primary
agent's actual HTTP run passed outside that restriction. Local shape/diff/docs
review passed: one cohesive extraction owner, no legacy array reader or image
repacking path, and no production runtime or snapshot edits in the deliverable.

## Choice audit for integration

- **Embedded data URIs are accepted alongside GLB buffer views.** When a local
  exporter puts a PNG directly into JSON as base64 text rather than in the binary
  chunk, the baker decodes that transport encoding and emits the exact image bytes.
  External file/network URLs still reject. The plan named embedded images without
  choosing their container representation. This avoids an arbitrary GLB packaging
  restriction without adding external I/O. **Sound, high confidence.**
- **Image codec decoding remains with the prepared GPU owner.** The producer
  checks declared PNG/JPEG type, signatures and byte ranges; it does not introduce
  another complete image decoder. A malformed image body still rejects during
  the specified decode/preparation transaction, before replacement admission.
  Transport tests decode their synthetic PNG to verify pixel ordering but do not
  claim all accepted source bytes are already renderable. The alternative would
  add a second decoding dependency and validation owner. **Sound, high confidence.**

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `appearance.test.mjs`: tier scalar equivalence | Looked up slots in an array | Looks up slots in the surface container; same scalar equivalence assertions | Container ownership moved, not scalar meaning. **moved** |
| `appearance.test.mjs`: source scalar provenance | Looked up source factors using each material's interim GLB reference | Compares retained source fixture factors by authored fixture material name; reads runtime slots through `surface.materials` | Delete the interim second material owner while retaining the same source factor oracle. **moved** |
| `appearance.test.mjs`: HTTP texture transfer | No emitted texture resource assertion | Exact encoded bytes and sampler values must survive production loading | Adds coverage for the new complete surface contract. **moved** |
| `appearance-materials.test.mjs` | No source texture transport gate | Real checker, asymmetric channel-coded image, sampler/slot/invalid-source and unchanged-geometry checks | New 04b transport behavior; initial container tracer and nested-index regression each observed red→green. **moved** |

The shared GLB mutation helper moved unchanged into `bake/test-harness/`; existing
mask, rig, pose, uint32 and CLI assertions remain intact. No simulation stat or
gameplay test changed.
