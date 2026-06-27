# 15 — Battle Crowd Production Parity

## Contract

The live battle path renders all living/dead soldiers through the raw WebGPU
skinned crowd pipeline at production scale, using current wasm zero-copy views
and deterministic animation state.

The old detailed soldier model language is the parity floor: class silhouettes,
equipment, faction accents, mounted/unmounted distinction, and animation pose
beats should match the tracked model screenshots and GIF references before the
WebGPU battle renderer is visually complete.

## API Seam

- `packages/game-renderer/src/battle/crowdPass.ts`
  - consumes positions, facings, frames, alive, soldier-unit, unit info,
    radius, class/render-look, selection, and LOD policy.
- `web/src/battle/rawWebGpuBattle.ts`
  - adapter from `BattleScene` to `GameRenderer`.

## Playable Deliverable

- `/webgpu/battle-live`
- Also a non-default live route or renderer selector for real `BattleScene`
  testing before production cutover.
- Current checkpoint: the production battle route renders the live crowd through
  the raw-WebGPU skinned pipeline and applies a deterministic warm-key/cool-fill
  soldier material grade in the skinned shader. Team colors still survive
  tactical minification, but bronze, linen, and leather now contribute visible
  depth instead of collapsing every soldier into a flat faction token.
- Depth checkpoint: skinned soldiers are now true world-pass geometry. The
  skinned pipeline declares a `depth24plus` attachment, projects vertices with
  the shared battle world-depth helper, and all lab/production battle routes
  submit the crowd through `depthExtra`. Terrain stays behind it, while
  selection, debug/path triangles, DOM/HUD, and minimap surfaces are explicit
  overlays. This is the foundation for rank/weapon occlusion; remaining
  soldier-art work must build on this pass contract instead of restoring
  painter-order crowd drawing.

## Verification

- Scenario boots a live 5v5 with WebGPU crowd and asserts player/enemy pixels,
  alive count, dead pose handling, and animation phase diff.
- Lab-route verification must include at least one live wide battle route and
  one battle-input route, because a depth-enabled crowd pipeline submitted to a
  no-depth pass can produce a mostly black frame while isolated skinned routes
  still pass.
- Scale fixtures render 1k, 5k, 10k, and current max battle counts.
- `webgpu-visual-report` captures the battle default and DPR2 selection/HUD
  scenes with skinned soldier material-lighting evidence.
- Dedicated model/contact-sheet screenshots compare WebGPU soldiers against
  `web/shots/baseline/models*` and representative `web/shots/anim/*.gif`
  frames, so dense battle shots cannot hide a missing model/animation port.
- Golden wasm/sim tests are unaffected.

## Must Stay Green

- No per-soldier CPU skeletal animation.
- The current `frames` protocol remains supported.
- Unit counts, positions, and class/render-look mapping match the current live
  battle state.

## Human Feedback

Review whether formations read as troops at tactical zooms before spending time
on final art.
