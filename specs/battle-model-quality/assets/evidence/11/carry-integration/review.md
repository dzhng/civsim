# Provisional carry source integration

The combined **heavy-kit** candidate retains the reviewed fitted source exactly:
GLB SHA-256 `0a7beffb16f962e9cbb2993a5a30a83dd0b0c76a2a58a6eabf78f0af6c5f31a8`.
Its editable Blender scene is retained verbatim too. The manual catalog remains
`presentation: null`; this is source integration, not art acceptance or live
battle promotion. The existing inspection and travel clips remain, with a
separate idle clip for at-ease carry.

The [motion recipe](../../../../../../packages/soldier-assets/bake/blender-heavy-motion.py)
now owns explicit carry and ready-arm authoring. It loads the combined editable
kit and replaces owned motion actions, preserving fitted geometry rather than
rebuilding hands or gear. No runtime IK, gameplay states or animation-driven
movement enter this pass. Reauthoring defaults to heavy-kit; `--source` and
`--output` permit isolated studies. The old heavy-motion directory remains a
frozen earlier study, not the current pickup.

## Evidence

- [Source controls](controls.json): regenerated rig and every animation sample
  match the reviewed source; repeated authoring also preserves them. Relative
  to the prior canonical kit, the bind rig, torso/lower-body and inspection
  tracks are exact; only arm/hand tracks in ready, walk and run change.
- [Modular controls](modular-controls.json): all 26 unrelated modular meshes
  retain exact positions, topology, weights, UVs and material assignments;
  lower-body skin positions and weights are also exact.
- Blender re-export changes 14 tangent components by at most about 0.0001.
  Positions, normals, UVs, weights, joints and indices remain exact. The committed
  GLB is the reviewed export, not this altered re-export; this pass does not
  claim byte-identical Blender export regeneration. Pixel equivalence of that
  re-export is unproven; clean-export acceptance remains open. No exporter
  tolerance changed.
- [Travel comparison](source-image-parity.json): all 136 integrated travel PNGs
  match the frozen reviewed source byte-for-byte. The [cap-fit view](cap-fit.png)
  also matches exactly; [11 capture/comparison checks](cap-fit-checks.json) pass.
  The complete heavy-kit scene passes; its repeat records 1,105 passing checks,
  no page errors and all 151 snapshots at zero pixel difference in
  [the run report](full-repeat.json), including new idle/formation coverage.
- `node packages/soldier-assets/bake/heavy-kit.mjs --check` passes against both
  committed candidate locations. All captures use bundled headless
  Chromium/SwiftShader, fixed daylight, existing cameras and phases. No Rust
  changed; the existing built WASM was reused.

Reproduce from the repository's web directory with a local server at 5192:

```sh
VERIFY_GPU=1 VERIFY_URL=http://localhost:5192 node scene.mjs heavy-kit
```

The looping derivatives preserve the gated frames at their prescribed speed:
[walk side](walk-side.gif), [walk oblique](walk-oblique.gif),
[run side](run-side.gif), [run oblique](run-oblique.gif).

## Review and limits

Direct inspection covered idle, ready, formation, attachment detail and every
travel frame in sequential sheets. The source is preserved, not newly judged
finished. Fresh unprimed critique sees a readable whole silhouette but retains
the open C-shaped shield grasp/bright rail ends, rounded ready elbow, restrained
upper-body motion and straight-edged ground shadows. It sees no clear detached
support or severe limb inversion. These remain source-quality/rendering work;
protected travel, speed ramps and animated idle remain open.

Codex CLI review was attempted and failed because the configured model requires
a newer CLI. A fresh independent reviewer supplied the fallback: obsolete
left-arm argument calculations were removed, then the reviewer confirmed the
diff clean. The cleaned recipe still matches all rig/clip samples. Shape review
kept motion ownership in the existing recipe; documentation review distinguishes
the combined source from the frozen older study. The integrating agent owns the
parent spec's evidence link and ongoing human review.

## Choices audit

- **Sound, high confidence — preserve edited geometry as editable data.** Opening
  the reviewed scene retains its fitted grips and the rest of the kit. A full
  procedural rebuild could overwrite unrelated fitting. Motion authoring therefore
  consumes that saved source; no scratch string rewriting or monkeypatch is needed.
- **Sound, high confidence — keep the reviewed export despite tangent drift.**
  Re-exporting a saved scene can alter tiny tangent rounding values even when
  positions and animation match. Shipping its already-reviewed GLB preserves
  the exact visible result; the raw controls expose the regeneration limitation.
- **Sound, high confidence — make the combined kit the recipe default.** A normal
  reauthoring run should update the candidate being reviewed, not silently write
  a stale separate study. Explicit alternate paths remain available for experiments.
- **Sound, high confidence — include idle in existing formation sheets.** A
  standing soldier must show both relaxed and protected carry. An extra row and
  standalone idle sheet preserve every earlier camera/phase while exposing that
  distinction; none of this selects an action in live combat.

## Change ledger

[Every moved baseline](changed-baselines.json) records its previous and current
SHA-256 and reason: 150 existing images use the fitted carry source, and one
new image covers idle. Existing assertions remain; formation sheets add the
at-ease row. No simulation test, stat, timing constant or production appearance
binding changed.
