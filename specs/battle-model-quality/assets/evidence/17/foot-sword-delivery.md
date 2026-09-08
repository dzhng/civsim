# Fitted foot-sword delivery

The peasant, light sword and medium infantry candidates reuse the saved fitted
human rig and complete heavy action set. The authoring recipe composes editable
parts, removes absent equipment and changes actual material-atlas UV tiles as
well as slots. Merely changing a material name leaves the old atlas appearance.
The round shield is shortened along its fitted principal axis, preserving its
depth and hand attachment. No downloaded or generated-service model is used.

Sources live under `packages/soldier-assets/assets/source/foot-roster/`; the
background authoring owner is `bake/blender-foot-variant.py`, and
`bake/foot-variant.mjs` resolves names against the canonical appearance registry.
Run the Python recipe with the saved heavy Blend plus the registry's armor,
shield and helmet choices, then bake its exported GLB with `--name` and
`--source`. `--check` verifies saved output without modifying it.

## Evidence and limits

- All three exported rigs and 13 action arrays exactly match the saved heavy
  source. Directional stride metadata now comes from one shared heavy-motion
  contract used by both heavy and foot-variant bakers.
- The production workbench scene `blender-foot-roster` captures each candidate
  at equipment and gameplay pitches; 36 poses form six committed sheets.
  Initial material-slot-only images failed the intended material identity.
  The UV-corrected pass intentionally changed all six images; heavy death and
  medium thrust control sheets remained pixel-exact on the merged branch.
- Root inspected every corrected sheet. Fresh independent review confirms
  hip skin pokes, shoulder seams, rectangular ground shadows, weak light/medium
  material contrast and an awkward-looking exposed shield connector. No
  definite missing or floating equipment was established. These limitations
  are retained under the user's completion-first direction, not called fixed.
- Source-only independent code review found no actionable issue. Web tests:
  382 passed in 62 files; TypeScript passed. The three bake checks reproduce
  their saved candidates. The scene retains exact frozen-pose checks and
  zero-tolerance image gates.

These are still manual candidates with identical near/mid/coarse geometry.
Production bindings, real distance representations and whole-roster state
verification remain required; this checkpoint does not close those contracts.

Reproduce the static gate from `web/` with the worktree dev server running:

```sh
SNAP=foot-roster VERIFY_GPU=1 VERIFY_URL=http://localhost:5437 node scene.mjs blender-foot-roster
```
