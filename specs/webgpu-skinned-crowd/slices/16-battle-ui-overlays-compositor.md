# 16 — Battle UI, Overlays, And Compositor

## Contract

Battle UI and tactical overlays compose correctly over the WebGPU world:
selection glow, destination ghosts, path previews, attack arcs, banners,
minimap, HUD, unit cards, toolbar, pause/game-over modals, and manual links.
The ownership split is explicit: world-anchored game surfaces are WebGPU-owned;
dense controls may remain DOM only when the contract documents layering,
input, focus, and screenshot behavior. After WebGPU battle cutover, current
renderer screenshots stop being a routine parallel suite.

## API Seam

- `packages/game-renderer/src/battle/overlayPass.ts`
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
- Current checkpoint: WebGPU battle overlays now share the live
  `x, y, r, g, b` vertex contract from `web/src/shared/overlays.ts`. The
  `BattleOverlayPass` vertex layout and frozen-report overlay filter both use
  the five-float stride, fixing the stale RGBA assumption that could scramble
  overlay lines and make selection rings disappear. Selected units now draw a
  two-stroke warm gold ground ring. Battle Selection DPR2 sits at `0.10928`
  full-frame parity distance and `0.13474` world-crop parity distance, meeting
  the current `0.14` target for this capture/crop; an unprimed critique accepted
  this narrow overlay checkpoint while still asking for a thicker/clearer ring,
  better tiny text/tray readability, a cleaner transparent stats panel, a
  clearer minimap, and less repetitive terrain.

## Verification

- Screenshot cases cover each overlay state.
- `/webgpu/battle-ui` scenario asserts WebGPU-owned overlay/minimap pixels and
  DOM-retained HUD/cards/toolbars in the same frame.
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
