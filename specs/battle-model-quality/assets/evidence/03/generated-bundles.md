# Generated complete bundles — 03b producer evidence

This is packaging and numerical evidence, not visual acceptance or runtime cutover completion. The current placeholder geometry and animation are unchanged. The ordinary appearance loader resolves serialized content; it does not fabricate a missing tier.

## Verification

Run from the repository root with Node 24:

```sh
node packages/soldier-assets/bake/soldier-placeholders.mjs
node packages/soldier-assets/bake/soldier-placeholders.mjs --check
node packages/soldier-assets/bake/soldier-placeholders.test.mjs
node packages/soldier-assets/bake/vat.test.mjs
node packages/soldier-assets/bake/gltf.test.mjs
```

All pass. Before generation, `--check` failed and named the missing outputs. The new bundle test serves actual files over HTTP to the shared appearance loader, checks every tier against the existing generator, and checks the persisted skeleton and animation against their source. All 20 appearances resolve. It checks 2,058,336 posed vertex positions across every baked frame, three tiers and far-source geometry; the greatest distance from the declared center is 0.9166128302044211 of its radius. Repeated generation and both package/web copies are byte-identical.

The bounds are the sphere enclosing the axis-aligned union of all exported frame positions. Rotate the center with the instance orientation. This proves coverage for current baked-frame playback and convex matrix interpolation, not future local-transform animation blending: that later playback contract must re-evaluate arc extrema.

## Review and decisions

Shape review kept bundle output in the existing placeholder baker, reused the shared mesh encoder and CPU poser, and retained one archetype naming source. The far representation explicitly references each appearance's full-detail tier at idle phase zero; using the coarse tier would omit equipment from the atlas silhouette. Neutral white material factors preserve authored placeholder vertex colors; final surface fidelity belongs to04.

Independent Codex review found two P2s. First, obsolete generated appearance files were invisible to `--check`. The check now enumerates its owned `appearances/` subtree and rejects extras; a test creates a unique obsolete bundle, verifies the actionable CLI failure, removes it, then verifies green. It does not silently delete stale artifacts. Second, the new loader/bounds test needs inclusion in the existing `bake:test` command; that package-script edit is owned by the integrating runtime pass.

No simulation or renderer behavior was edited. The old kit output remains only until the integrating03 consumer cutover removes its reader and producer together; the animation file is shared, not duplicated into a second format. The copied `appearanceBundle.ts` used for worktree verification belongs to the integrating agent and is excluded from this producer commit.

The generator currently owns `appearances/`. Detailed art must enter this same catalog through an updated authoring source registry, not be copied into that generated directory behind its owner's back; diagnostic candidates live under `candidates/`. Numeric mesh JSON is compact, while manifests and source-rig metadata remain readable. This avoids nearly a million generated numeric-only lines without changing any values.

## Test change ledger

- `soldier-placeholders.mjs --check`: previously compared only the kit and animation outputs. Now checks every generated bundle resource in both output roots and rejects obsolete appearance files, so a green bake cannot hide a stale or incomplete bundle tree.
- `soldier-placeholders.test.mjs`: new gate verifies actual loaded geometry, source skeleton/animation, distinct tiers, far geometry, pose containment, deterministic output and stale-file rejection. It does not replace or weaken existing VAT/glTF assertions.
