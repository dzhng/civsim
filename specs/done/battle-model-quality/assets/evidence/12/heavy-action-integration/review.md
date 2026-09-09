# Selective heavy action composition

Integration gate passed; no final art or live presentation approval. This pass
composes the retained sword-effort B and hit B into the fitted ten-action heavy
source without reauthoring either motion or rebuilding equipment. The attack's
cramped release and low finish hold, and the hit's mild crouch-like readability,
remain the limitations recorded by their independent studies.

## Ownership and source controls

The explicit ten-action input is the heavy source at `22084812`, preserved at
`/Users/david/dev/game-heavy-attack-integration/throwaway/attack-integration/control/heavy-kit.blend`.
Its SHA-256 is `458e2604f793375b2646d6e0b1ff34209ef9ef5d86738110dbdde557083e2b74`;
the adjacent GLB is `1737da781c4f2b26698227d66391ab98c7345c630627f7cad255f39308d11638`.
The existing heavy-motion owner appends explicitly named donor actions, refuses
an existing or duplicate target, checks the bind rig, and exports once. It does
not silently replace actions and must not be rerun against its twelve-action
output as though that output were the original input.

The sword donor is the captured B from study `ff943d5e` (root `22084812`):
`/Users/david/dev/game-heavy-attack-study/throwaway/heavy-attack/b/heavy-kit.blend`.
The hit donor is study `23935ce566a047a0129758959b86428a5dd01186`:
`/Users/david/dev/game-heavy-hit-study/packages/soldier-assets/assets/source/heavy-kit/heavy-kit.blend`.
Both use the frozen 30 fps source convention. Their independent study evidence
is retained; the hit donor binary is not copied over the composed asset.

[Source controls](source-controls.json) establish exact 37 editable meshes,
bind rig, previous ten actions including key handles, and both appended donor
actions. [Import controls](import-controls.json) establish exact old and donor
animation arrays; only fresh tangent arrays differ on primitives 0, 1, 6 and 7.
This is not pixel equivalence. No tangents are pinned. [Negative controls](composition-guards.json)
reject missing, existing, duplicate and incompatible-rig requests before export.

The frozen combined Blend SHA-256 is
`6ac9314560a7871fb8638c7efce652b8d8ea72091fa81b5c546be45d62b3dc0f`;
fresh GLB is `2aa531af1e895a9f870a3e8d1fac72a5d05090e979f6f14fe2c108591ae2cbef`.
The detailed appearance remains manual-only, with `presentation: null`.

## Bounded static gate

Capture 67898 completed successfully without UPDATE. All three hit sheets were
exactly equal to the retained donor baselines; the new fourteen-pose attack sheet
was created and each pose reproduced exactly within the capture. Author and root
inspected all fourteen poses with no new gross integration defect.
[Donor comparison](static-donor-comparison.json) finds zero changed body pixels
for all thirteen matching camera/time tiles. Front 0.700 s has no matching old
camera/time capture and is explicitly a new reviewed pose, not an equality claim.
Root approved this new static baseline, not a motion-quality upgrade.

[Fresh static critique](fresh-static-review.txt), session
`01a07ddb-5a32-71b3-a864-eedb255504be`, loaded the whole sheet and all seven
full-resolution rows (eight actual image payloads). It reports restrained body
transfer, cramped release and low-pose similarity, without confirmed detachment
or intersection. These agree with the retained study limits, not final acceptance.

The existing scene declares 577 unique snapshots: all 477 previous snapshots,
three hit sheets, one attack sheet and 96 attack film frames. Full run 39225
completed with terminal 0, all checks passed and no page errors. All 477 previous
baselines passed unchanged. The three hit sheets and attack static sheet passed
their existing scoped baselines; the 96 film baselines were newly created, with
every frame also passing an immediate exact repeat and production phase check.
[All 96 complete PNGs](film-donor-comparison.json), including captions, are
byte-identical to captured B (comparison 58194, terminal 0). The existing study's
full-frame critique and review movies therefore describe this same film.

No previous baseline was updated, no tangent exception was required, and no
tolerance was relaxed. Root owns the independent normal full 577-image run on
the merged tree; this lane does not claim that pending independent repeat has
already passed. Root explicitly chose that merged run instead of a redundant
second complete local run after donor equality and immediate repeats passed.

That independent merged run subsequently passed at the requested stopping
checkpoint: all 577 heavy snapshots matched exactly, alongside all 358 medium
snapshots, with no failures or page errors. See the [combined raw report](../final-actions-merged.json).

## Review and CPU checks

Shape review keeps action composition in the existing source owner and film
capture in the existing production scene. No second renderer, clock, controller,
or geometry owner was introduced. Diff review found no concrete defect.
[Independent code review](code-review.txt), session
`01a07dde-32dc-7100-bb58-22b398c12bfc`, completed read-only and independently
verified old packed animation samples and step masks after accounting for their
new offsets. It did not rerun Blender or GPU work.

The complete web suite passed 354 tests, TypeScript no-emit passed, and the heavy
candidate bake check passed. The first test run failed because sparse checkout
omitted committed mounted and campaign-mask fixtures; restoring those exact
fixtures resolved it without code or test changes. No sim behavior changed.

Change ledger: no old test behavior moved. The existing manual scene now checks
the two additional genuine actions, their static silhouettes, and the attack's
30 Hz effort with ready lead/tail. This adds evidence for the retained source;
it does not make a gameplay strike or hit-contact assertion. No live selection,
runtime schema or controller was changed. Root owns the global documentation
links; this leaf owns composition evidence, not a second spec status ledger.

## Reproduction

From the integration worktree, with the preserved donor files above:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-heavy-motion.py -- --source throwaway/attack-integration/control/heavy-kit.blend --action-donor sword-effort /Users/david/dev/game-heavy-attack-study/throwaway/heavy-attack/b/heavy-kit.blend --action-donor hit /Users/david/dev/game-heavy-hit-study/packages/soldier-assets/assets/source/heavy-kit/heavy-kit.blend --output throwaway/attack-integration/reproduction
node packages/soldier-assets/bake/heavy-kit.mjs --check
SNAP=sword-effort-poses,hit-motion,hit-side-smoke,hit-smoke VERIFY_GPU=1 VERIFY_URL=http://localhost:5441 node web/scene.mjs heavy-kit
VERIFY_GPU=1 VERIFY_URL=http://localhost:5441 node web/scene.mjs heavy-kit
```

The source controls and one-off diagnostic scripts remain under ignored
`throwaway/`; this leaf archives their results, not a parallel capture owner.
Re-exporting may produce fresh tangent rounding; reproduce against a separate
output and do not replace the frozen captured asset mid-gate.

The preserved scratch checks were run with Blender `--background --factory-startup
--python-exit-code 1 --python throwaway/source-controls.py`, likewise
`throwaway/composition-guards.py`, followed by `node throwaway/import-attack.mjs`,
`node throwaway/static-comparison.mjs` and `node throwaway/compare-integrated-film.mjs`.
Their absolute worktree is `/Users/david/dev/game-heavy-attack-integration`.
