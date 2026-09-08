# Practical runtime tiers

The unchanged 33 ms hardware gate rejected the first pair with editable originals used as runtime near. This is a functional asset-budget correction, not cosmetic refinement: keep those originals for editing/close inspection, and export runtime near too.

The existing exporter now emits `near`, `mid`, and `far` from the same unchanged saved source, targeting 8,000 / 1,000 / 250 triangles. These are targets, not falsely reported caps. Actual heavy is 7,958 / 982 / 376; medium is 7,972 / 1,066 / 460. Blender retains some topology beyond requested collapse ratios. All thirteen heavy and fifteen medium imported actions, rigs and material JSON remain exact; all runtime tiers retain finite attributes and normalized four-influence skinning. Geometry itself is deliberately reduced and needs visual review.

## Decisions and limits

- Near retains every detached component. Mid may omit a component whose maximum world-space axis extent is below 0.03 metres; far uses 0.15 metres. At the existing small projected mesh bands these are sub-pixel details on ordinary foot bodies. This is an offline approximation, not a screen-space visibility guarantee for every action/view.
- Extent, not thickness or vertex count, protects long thin weapons from omission. Retained islands with at most 32 triangles stay exact. Larger retained islands get a 12 / 8 / 4 triangle minimum before the remaining target is distributed in proportion to their reducible source counts. The minimum is not proof of correct shape.
- Heavy has forty connected components; twenty have maximum extent at least 0.15 metres. Body, shield and sword are among those retained. Far intentionally gives up small detached fittings. No body/weapon class classifier, renderer threshold change, action rewrite or original-source mutation was added.
- The same exporter and existing final GLB owner remain the only implementation. Runtime files live beside each other under the source family's `lods/`; the original named GLB remains the archive/inspection source.

## Regression and review

`packages/soldier-assets/bake/blender-mesh-lods.test.py` keeps the previous original-mesh, UV/material, normalized skin and exact long-weapon checks. A new consumer appends a detached 2 cm bead: distant reduction must remove its polygons without touching the original or changing the complete long thin weapon, and remain within the fixture's triangle budget. It fails on the old exporter (unsupported omission contract), then passes the implementation. This is numerical geometry coverage, not art acceptance.

The existing `mesh-lods.test.mjs` was run for original/near/mid and original/mid/far on both sources, covering every emitted tier against the untouched original. All pass.

Independent read-only CLI review found no actionable correctness defect in the two-file diff and passed syntax checks. Its Blender startup crashed under the read-only sandbox before test execution; that attempt is not claimed as a regression reproduction. Main's background Blender red/green and real export/import controls are the executed proof. Shape review retains one owner and no new production policy.

## Change ledger

| Test | Previous behavior | New behavior | Why / provenance |
| --- | --- | --- | --- |
| `packages/soldier-assets/bake/blender-mesh-lods.test.py` — distant detail consumer | No distant omission contract; all islands retained | A small detached bead disappears while source and long weapon remain exact | New regression, red/green logs; authorized runtime asset budget correction |
| `packages/soldier-assets/bake/mesh-lods.test.mjs` — actual first-pair imports | Original near plus two reduced tiers validated | Also validates newly reduced near against the original, without weakening exact action/rig/material or skin checks | Existing oracle applied to additional real inputs |

Reproduce with the existing Blender command and `--source`, `--body`, `--output`; optional target arguments are `--near-triangles`, `--mid-triangles`, `--far-triangles`. This focused exporter pass does not claim a green hardware envelope or ship new visual baselines.
