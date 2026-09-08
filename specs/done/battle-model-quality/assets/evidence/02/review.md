# Blender export oracle

## Contract proved

Original local Blender source exports through the standard three.js loader with its surface deformation intact. This is an export oracle, not production crowd acceptance or finished soldier anatomy. The fixture intentionally separates coarse torso/leg parts so distinct coordinate and deformation errors remain visible.

Run the source script with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-reference-fixtures.py
```

Use `--python-exit-code 1`: Blender otherwise can exit successfully after a Python exception. The script writes source .blend, embedded GLB and evaluated surface landmarks in the soldier-assets test fixture folder. Controls are baked into deform joints; the control bone is absent from the exported skin. Human geometry exercises four nonzero weights, asymmetric elbow/knee bends and an off-centre shield grip. The mounted fixture proves local rider-upper-body tracks composed over gait in one deform skeleton.

## Evidence

- `cd web && VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node scene.mjs blender-reference battle-model-workbench`: [final report](final-checks.json), zero pixel differences on both export sheets and the existing workbench.
- Every mapped exported vertex is compared against Blender's evaluated world position at all fourteen authored samples, viewed from two bearings. Maximum error is below 4.72e-7 metres, against 3e-5 metres tolerance. The hash check prevents pairing stale landmarks with a new GLB.
- Actual repeated renders—not two reads of one canvas—are byte-identical. Twenty immediate selection changes leave one active fixture and four resident textures, unchanged.
- Existing `gltf.test.mjs`, `vat.test.mjs` and `bun run typecheck` pass. [Independent source probe](numerical-review.json) records repeated export hashes and vertex errors.

## Visual judgment

The initial all-over checker obscured bends and stretched across independently mapped triangles. The final source uses plain diagnostic surfaces and a planar checker on the shield only. Source geometry, weights, rig and all fourteen expected position sets are unchanged. Exported shield UV edge-scale spread was below 8.03e-7 in the independent source check.

[Before/after telemetry](comparison/visual-parity-diff.json) gives human image distance 0.13522 and mounted 0.18177. Edge-energy ratios fall to 0.60207 and 0.39348 because checker noise was removed, not because geometry disappeared; every source surface point is still checked. The final candidate is less wrong for examining continuous bends and composed poses. [Current sheets and enlarged crops](current/) retain the review surface.

A fresh final reviewer confirmed consistent framing, readable pose labels, no tile clipping, continuous elbow/knee bends and distinguishable gait/rider/composed states. Visible component gaps in the human are intentional diagnostic construction, not accepted anatomy. The shield's small rasterized checks still look uneven at sheet scale; this does not establish production material fidelity (slice04 owns that). Overlapping horse legs limit visual judgment of every individual root, while numerical comparisons cover all vertices; detailed mounted shape and gait remain slices21–24. No anatomical, realistic-motion or AAA-quality claim follows from these fixtures.

## Review and decisions

Source review's alleged double transform was rejected only after actual GLTFLoader evaluation demonstrated the omitted bind inverse. Browser review correctly found overlapping asynchronous loads, undisposed texture ownership and a repeat check that did not render twice. The final oracle preloads its fixed pair and switches synchronously, keeping bounded resources for its lifetime; the strengthened browser checks prove selection isolation and fresh-render determinism. The source does not borrow third-party assets or invoke generation services.

Production camera math is reused through the existing bridge; only this explicitly isolated oracle uses neutral lighting. Source-to-production conversion and shadow parity still belong to03. No existing gameplay or test expectation changed. Preview opened at 01:29 UTC for non-blocking feedback and was closed when proceeding with03. With no corrective feedback, acceptance rests on the recorded numerical and independent visual evidence, not assumed user approval.
