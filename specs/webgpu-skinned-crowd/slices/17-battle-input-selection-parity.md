# 17 — Battle Input And Selection Parity

## Contract

The WebGPU battle path preserves exact camera, picking, drag-box, command, and
freeze semantics across device-pixel ratios and viewport sizes.

## API Seam

- `web/src/battle/input.ts` remains the command source.
- `packages/game-renderer/src/battle/pickingDebug.ts`
  - WebGPU route picking/projection helpers and test debug data; tests still
    click rendered canvas pixels instead of calling a select shortcut.
- `web/src/shared/camera.ts` remains unchanged unless a separate additive camera
  contract is explicitly approved.

## Playable Deliverable

- `/webgpu/battle-input`
- Live battle route with WebGPU terrain/crowd/overlay/minimap, retained battle
  UI, click/drag selection, right-click move order, camera zoom, DPR, absolute
  freeze tick, and last pick/order debug data.
- Production battle route (`?battle=5v5&ai=off`) exercises the same real canvas
  input path after WebGPU becomes the normal battle renderer.

## Verification

- Scenario repeats existing battle-selection checks against WebGPU at DPR 1 and
  DPR 2.
- `battle-webgpu-input` runs on the production battle route at DPR 1 and DPR 2
  and asserts `renderer: "webgpu"` before performing any input checks.
- Click tests target actual rendered pixels, not a self-consistent projection.
- Route stats expose selected units and last pick result so Playwright can
  assert the real mouse path changed the WebGPU selection state.
- Right-click tests assert the selected unit's wasm target fields changed on the
  shipped route, not just the lab route.
- Wheel tests assert the production WebGPU camera changes through the canvas
  input path.
- Freeze tests call `freezeAtTick` twice and require pixel-identical decoded
  screenshots at the same absolute tick; raw PNG byte comparison remains logged
  only as diagnostic data.

## Must Stay Green

- Current `battle-selection` scenario stays green only until the WebGPU battle
  input scenario replaces it as the production gate.
- `npm run scenario:webgpu` includes `battle-webgpu-input`; the old
  `battle-selection` gate is migration evidence only after cutover.
- `window.__webgpuBattleInput.freezeAtTick` remains deterministic.
- Legacy vibe timelines using `?debug=blocks` remain migration evidence only;
  after cutover, routine screenshot gates are WebGPU-only.

## Human Feedback

Any selection miss or camera drift is a blocker for production cutover, even if
the render looks good.
