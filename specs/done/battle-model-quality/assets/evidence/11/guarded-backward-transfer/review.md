# Guarded backward weight-transfer revision

This isolated candidate responds to the fresh critique archived in the adjacent
`guarded-backward/review.md`. Its control is that original backward candidate at
`c3979a03`, not an uncaptured standing guard or forward walk. No live selection or
simulation change is included. Parent owns promotion and copies only the new
action if accepted.

The revision increases alternating support compression and lateral transfer,
adds delayed chest/neck counterresponse and small proximal arm stabilization,
widens foot placement by 4 cm overall, and strengthens toe-contact/heel-settle
roll. The low 4.5 cm swing arc is retained. Fine hands, mesh and rig are unchanged.
The fixed donor must be 30 fps; frames 0–30 remain one second, with the unchanged
0.916110 m authored cycle distance and the original recorded centroid trajectory.

## Numeric evidence

All seven donor clips remain imported-exact, along with the full rig. Mesh fields
remain exact except known tiny tangent rounding in primitives 0 and 7. Source
controls preserve original action key coordinates, handles and interpolation.
The revised GLB SHA-256 is
`f7bcd3da4d622ab73756a3e8249f00b60474a4707c5abeaefc13421393de7609`.

Floor telemetry uses the same sole vertices, sampling and flat windows as the
control. There are small geometric regressions, not an all-metrics improvement:

| Geometric fixture measure | Control | Revision |
| --- | ---: | ---: |
| Constant authored-speed flat longitudinal drift | 0.299 mm | 0.422 mm |
| Recorded-trajectory flat longitudinal drift | 0.295 mm | 0.416 mm |
| Recorded-trajectory flat lateral drift | 3.026 mm | 3.030 mm |
| Recorded-trajectory minimum sole Z | −0.394 mm | −0.638 mm |

The trajectory is an actual ten-man centroid trace, not evidence of individual
self-propulsion or contact forces. Its 30 Hz sampling, 2 s interval, vectors and
engine state remain in the adjacent original evidence. The revision applies the
same distance-driven phase and samples imported production skinning at 240 Hz.
Each contiguous flat interval (foot-local phase 0.10–0.45) is measured separately.

The source BVH surface check again reports no overlaps across 61 half-frame
samples of the specified sword/shield/body/clothing/sole pairs. This does not
prove containment, every pair or every runtime interpolation instant.

## Review status

Bundled Codex CLI 0.153.4 independently reviewed the focused uncommitted recipe
diff with configured defaults, terminal 0: no actionable defects. It explicitly
did not assess visual acceptance. The source recipe remains in the existing
authoring owner; all one-off probes and capture scripts remain ignored scratch.
No tests or gameplay behavior changed.

## Matched visual result

Both views were captured through the production renderer for two cycles, 40
frames each at 20 fps. All 80 immediate repeat frames matched exactly in pixels
and submitted state: 241 checks, no errors, terminal 0. `pixel-comparison.json`
confirms all 80 original/revision frames differ, with exactly matched camera,
time, root vector trace and phase. Pair each `capture/backward-{view}-{frame}.png`
here with the identically named full-context image in `../guarded-backward/capture`.
This preserves every matched whole frame, not only favorable crops. The ten
chronological strips and two GIFs show the complete captured sequence.

Author inspected both full contexts and all 80 revised frames against the
previously inspected control: modestly clearer ankle roll and oblique weight sway,
with upright/rigid upper guard still prominent. No definite detached gear was
observed. Numeric support does not establish convincing body weight.

The fresh read-only CLI critic also inspected four full contexts, every strip in
both sequences and ambiguous original frames. It judged **B provisionally less
wrong, moderate confidence**, but rejected full visual acceptance. Slightly more
settling (side-2 cells 1–5; side-4 cells 4–8) and clearer toe-down/heel-raised contact
(side-0 cell 1; side-2 cells 4–5) help. High-confidence residuals are the nearly
fixed head/chest/shoulder/shield arrangement and crowded passing feet (side-0
cells 7–8; side-3 cells 3–4; oblique-0 cell 8). The wider authored stance did not
clearly solve that visual crowding. Actual interpenetration or planted-foot
sliding was not established. Medium-confidence rigid scabbard response remains.
`fresh-critique.txt` preserves the complete findings and evidence limits.

Author and fresh reviewer agree on the persistent stiffness. Keep this as a
provisional candidate only; credible receiving-leg loading and readable passing
steps remain open. No further authoring or live promotion is implied by this
focused pass.

## Reproduction and ownership

Use the durable recipe and frozen donor command recorded in the original report,
now at this revision. Scratch measurement/capture probes use the same paths and
trajectory. The revision capture was run with:

```sh
node throwaway/bake-backward.mjs
UPDATE_SHOTS=1 VERIFY_GPU=1 VERIFY_URL=http://localhost:5269 node throwaway/capture-backward.mjs
node throwaway/backward-strips.mjs
node throwaway/backward-pixel-compare.mjs
node throwaway/backward-foot-contact.mjs throwaway/guarded-backward/source/heavy-guarded.glb transfer-v1
node throwaway/backward-controls.mjs /Users/david/dev/game-heavy-idle-motion/throwaway/heavy-ready/source/candidate/heavy-motion.glb throwaway/guarded-backward/source/heavy-guarded.glb transfer-controls-v1
node throwaway/backward-recorded-floor.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python throwaway/backward-contact.py
```

Run from `/Users/david/dev/game-heavy-guarded-backward`, with GPU serialized and
baking complete. UPDATE_SHOTS only refreshes this isolated scratch baseline; the
committed original control remains untouched. Output source for parent action
transfer is `throwaway/guarded-backward/source/heavy-guarded.blend`; original source
is `throwaway/guarded-backward-control/source/heavy-guarded.blend`. Import only the
new action, not the donor's old clips. Self-review found no scope or owner drift;
staged whitespace check and independent code review are separate from the
provisional visual verdict.
