# 16 — Battle UI, Overlays, And Compositor

## Contract

Battle UI and tactical ground cues compose correctly with the WebGPU world:
selection glow, destination ghosts, path previews, attack arcs, banners,
minimap, HUD, unit cards, toolbar, pause/game-over modals, and manual links.
The ownership split is explicit: world-anchored game surfaces are WebGPU-owned
and depth-aware; dense controls may remain DOM only when the contract documents
layering, input, focus, and screenshot behavior. After WebGPU battle cutover,
current renderer screenshots stop being a routine parallel suite.

## API Seam

- `packages/game-renderer/src/battle/groundCuePass.ts`
  - owns depth-read battlefield ground cues such as selection rings and reform
    ghosts.
- `packages/game-renderer/src/battle/effectLinePass.ts`
  - owns transient non-depth tactical/effect lines such as projectiles and
    order-progress arcs until those families earn dedicated world-effect passes.
- `packages/game-renderer/src/battle/minimapPass.ts`
- `web/src/battle/webgpuUiLayer.ts`
  - explicitly owns which surfaces are WebGPU and which remain DOM.
  - exports the post-cutover screenshot rule: routine baselines are WebGPU-only.

## Playable Deliverable

- `/webgpu/battle-ui`
- Live wasm battle fixture with WebGPU terrain/crowd/selection/minimap plus the
  retained DOM HUD, toolbar, and unit cards.
- Follow-up fixture gallery for many banners, path orders, attack arcs, minimap
  viewport, routed unit, paused state, and game-over state.
- Current checkpoint: retained DOM unit banners now use zoom-aware scaling while
  preserving their bottom-center world anchor over the rendered formation. At
  the DPR2 visual-report zoom this makes standards/bars read more like compact
  unit identifiers than full-size floating UI, while selected units remain
  slightly emphasized. Battle Selection DPR2 parity distance moved from
  `0.15681` to `0.15644`; the visual report still renders all units that the
  archived current-renderer shot dropped.
- Current checkpoint: WebGPU battle ground cues now share the live
  `x, y, r, g, b` vertex contract from `web/src/shared/overlays.ts`. The
- `BattleGroundCuePass` vertex layout and frozen-report ground-cue filter both
  use the five-float stride, fixing the stale RGBA assumption that could
  scramble lines and make selection rings disappear.
- Current checkpoint: battlefield selection rings and reform ghosts now render
  as depth-read world cues (`battle-ground-cues`) instead of overlay UI. They
  use the shared battle depth helper and depth writes stay off, so soldiers and
  terrain props can occlude the cue while the cue never reserves pixels above
  real geometry.
- Current checkpoint: old battle line-overlay output is split by semantics.
  Ground paths, destination ghosts, drag previews, and selection rings feed the
  `battle-ground-cues` depth-read pass; projectiles and progress arcs feed the
  overlay-only `battle-effect-lines` pass. This prevents projectiles/effect
  strokes from masquerading as ground decals while preserving the eventual lane
  for true projectile-world rendering.
- Fresh unprimed critique of the updated Battle Selection DPR2 screenshot
  accepted the depth behavior but flagged visual follow-ups: the selected-unit
  ring is now too weak/low-contrast when correctly occluded by the formation,
  soldiers still read as tiny barcode strips at gameplay scale, the large terrain
  feature patch reads as flat stamped blobs, several unit-card labels truncate
  awkwardly, and card silhouettes are not distinctive enough. Treat these as
  visual tuning blockers for later acceptance, not reasons to move ground cues
  back to overlay.

## Verification

- Screenshot cases cover each overlay state.
- `/webgpu/battle-ui` scenario asserts WebGPU-owned ground-cue/minimap pixels
  and DOM-retained HUD/cards/toolbars in the same frame.
- DPR 1 and DPR 2 checks verify no text/control overlap and no canvas/DOM
  coordinate drift.
- `webgpu-visual-report` plus `compare-screenshots` tracks the Battle Selection
  DPR2 banner/label parity score and regenerated diff artifacts.
- Existing unit-card and banner gallery checks remain green or are deliberately
  replaced with WebGPU equivalents.
- Post-cutover screenshot/vibe runs target the WebGPU battle path only; legacy
  shots survive only inside the migration report.

## Must Stay Green

- Keyboard shortcuts, toolbar commands, unit cards, and pause controls keep
  their current behavior.
- DOM panels are allowed only where this slice documents the layering contract.

## Human Feedback

Review readability: tactical overlays must feel useful in play, not merely
present in a screenshot.
