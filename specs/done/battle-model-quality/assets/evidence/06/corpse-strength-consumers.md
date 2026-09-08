# Corpse presentation consumer foundation

The presentation strength has one owner in crowd-runtime: living submissions
use zero; dead timeline submissions use the base blend weight; manual dead
submissions use one. Three's instance payload and CPU culling-center roll, raw
skinning's instance payload, and far contact grounding consume that rule.
The final corpse treatment and the existing timeline duration stay unchanged.
Far grounding uses the complementary living factor; its manifest pose stays fixed.

This is the first bounded06c step. It does not establish temporal GPU continuity,
Three culling agreement in rendered frames, or visual acceptance. The subsequent
production temporal fixture owns those checks.

Verification: `bun run --cwd web typecheck` and `bun run --cwd web test` pass
(277 tests). Focused raw and far tests each failed at newly dying weight zero
before their consumer fix and passed afterward. The first broad run used stale
WASM copied from the original checkout and failed seven adapter/view tests;
copying the verified feature worktree's WASM resolved those failures without
source changes. Dependencies and WASM are verification-only local artifacts.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `far views use the same facing basis as the skinned mesh and its offset anchor` in `web/tests/impostorLayer.test.ts` | Living factor immediately became0 on death; the new onset assertion measured0 instead of1. | Death weights0,0.5,1 produce living factors1,0.5,0; existing manual-dead0 and living1 assertions remain. | Fade fixed-pose contact grounding with the shared death blend. **moved** |
| `class clip lookup follows appearances, not their flattened LOD resources` in `web/tests/skinnedPipeline.test.ts` | Corpse payload immediately became1 on death; the new onset assertion measured1 instead of0. | Dead payload follows weights0,0.5,1 despite fixed destination phase0.8; living stays0 and manual dead stays1. | Drive the actual GPU upload payload from shared presentation strength. **moved** |

The cherry-picked helper preparation adds source-level tests for observed-death
onset/midpoint/completion, reset, and manual states; those assertions were not
changed by consumer wiring. No simulation tests or unit stats changed.

Shape/diff/docs review found no additional production owner, sampler, clock,
geometry, timing, or schema change. The independent `codex review --uncommitted`
attempt could not start: installed CLI0.144.4 rejects configured `gpt-6-astra`
with HTTP400 requiring a newer CLI. A separate read-only review then found no
actionable issues in the bounded foundation and independently passed the26
focused timeline, raw and far tests. It retained the same pending Three runtime
culling and GPU continuity boundary.
