# Slice 2 — Shared soldier-shadow module, wired into BATTLE first

Battle gains soldier grounding shadows for the first time, through the module campaign
will later reuse. Isolating it to one scene keeps the before/after clean.

## Contract this unlocks

One shared soldier-shadow decal, proven in battle. Battle soldiers are anchored to the
ground by the same soft ellipse the campaign figures will use.

## API seam

- **Relocate + rename:** move
  `packages/game-renderer/src/battle/soldierShadowPass.ts` →
  `packages/renderer-core/src/soldierShadowPass.ts`; rename `BattleSoldierShadowPass` →
  `SoldierShadowDecalPass`. It depends only on `RawFrameShell`, `WORLD_CAMERA_WGSL`,
  `pipelineContracts`, and `CrowdInstance` — all cross-scene, so `renderer-core` (peer of
  the pipeline it shadows) is the natural home. *(Alt considered:
  `game-renderer/src/models/shared`.)*
- Apply the Slice 1 `worldDepthFn` param; construct with `'battle'` here. Replace the
  hardcoded `civsimBattleWorldDepth3d` at the old `:26`.
- **Wire into `web/src/battle/renderer.ts`:** instantiate the pass, `upload(this.instances)`
  alongside `this.crowd.upload`, and add a pass `battle-soldier-shadows`
  (role `world-decal`, phase `world-depth`, depth `read`) ordered after
  `battle-skinned-crowd` and beside `battle-terrain-scenery-shadow` (`renderer.ts:332`).
- **Contract:** add `battle-soldier-shadows` to the battle contract in
  `web/scenes/_renderer-contract.mjs` (additive; subset checks stay green).

## What the human can run / see

Live battle at gameplay zoom — soldiers now cast contact shadows; shadow count appears in
battle stats.

## Verification gate

- `web/scenes/battle/battle-terrain-elevation.mjs` — shadows must seat on relief (same
  elevation the skinned soldiers use).
- Re-bless battle visual/vibe snapshots that now include shadows via
  [screenshot-regression](../../../.claude/skills/screenshot-regression/SKILL.md).
- **Visual slice — required:**
  [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) (do the
  shadows read as grounding, not grime?) and
  [compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md)
  before/after (shadows are a clear before/after) against the
  [aesthetics](../../../.claude/skills/aesthetics/SKILL.md) north star.

## Review checkpoint (non-blocking)

Open before/after battle shots for David with
[preview-shots](../../../.claude/skills/preview-shots/SKILL.md); ~5 min. If silent, accept
on the compare-screenshots verdict, record it, close Preview, proceed.

## What must stay green

Battle contract (now including the new decal pass); campaign entirely untouched.

## Feedback that would change this slice

Shadow softness, radius, and darkness are the knobs (`SHADOW_WGSL` alpha `0.34`, radius
`0.62`, mounted `×1.5`). If David finds them too heavy/light, tune here — it sets the look
campaign inherits.

## Review outcome (2026-07-01) — accepted, one known limitation

Unprimed screenshot-critique on the re-blessed battle line: the shadow **asset is good** —
soft, desaturated-olive shaded earth (~35% luminance drop), feathered edges, no smear /
halo / artifact, consistent along the row, correctly pinned under the feet (a slight
forward offset, minor).

**Known limitation (accepted, not a regression):** in a *dense* multi-rank block only the
front rank's shadow is visible — each interior soldier's small contact ellipse is occluded
by the body of the man in the rank ahead (decal is depth-`read`, drawn after the opaque
crowd; it cannot be reordered before the crowd without violating the world-decal boundary).
This is inherent to the existing per-soldier decal — the *same* shadow already blessed in
the terrain-elevation lab block — so battle gaining it is a net improvement over none, not a
new defect. The feature's real target, **campaign stacks of ≤6 loose figures, does not hit
this** (figures don't stand rank-behind-rank). Revisit only if David wants denser battle
blocks fully grounded (would need a per-unit merged blob or a larger radius, a separate
polish slice that also re-blesses the lab block).
