# 21 — Campaign Battle Handoff

## Contract

The WebGPU campaign route can launch a WebGPU battle from campaign state,
resolve/return, and continue the campaign without renderer lifecycle leaks or
state corruption.

## API Seam

- `web/src/campaign/scene.ts`
  - WebGPU renderer adapter for campaign scene lifecycle.
  - exposes `window.__campaign.fightReady()` for verification, which calls the
    same pending-battle fight path as the modal button.
- `web/src/battle/scene.ts`
  - WebGPU renderer adapter for campaign battles.
- `web/src/main.ts`
  - provides `?campaign=handoff`, a tiny Rome-vs-Samnium fixture that produces
    a deterministic player battle without disturbing the peaceful visual
    campaign fixture.

## Playable Deliverable

- `/?campaign=handoff`
- `node scenario.mjs campaign-webgpu-handoff`
- `node scenario.mjs campaign-webgpu-conquest`
- `node scenario.mjs campaign-webgpu-reinforcements`
- `npm run scenario:webgpu:campaign`
- Starts controlled campaign, triggers a battle, returns to campaign, and shows
  a handoff report through scenario output.
- Starts a normal real-map campaign, marches on an independent city,
  auto-resolves the garrison battle, and verifies the campaign remains a
  savable WebGPU route.
- Stages a nearby split stack, launches the real campaign battle, advances
  until delayed reinforcements arrive, and verifies the WebGPU battle renderer
  uploads the expanded soldier set.

## Verification

- `web/scenarios/campaign-webgpu-handoff.mjs` drives campaign → pending
  encounter → WebGPU battle → Continue/Exit to Campaign → WebGPU campaign
  return.
- `web/scenarios/campaign-webgpu-conquest.mjs` drives menu → normal WebGPU
  campaign → move order to an independent city → garrison battle modal →
  auto-resolve → continued savable WebGPU campaign state.
- `web/scenarios/campaign-webgpu-reinforcements.mjs` drives menu → normal
  WebGPU campaign → split/stage reinforcement stack → pending battle with
  `reinforcements > 0` → Fight → WebGPU battle unit/soldier count growth.
- The scenario asserts that battle and campaign renderers are both WebGPU, the
  pending encounter clears, armies leave encounter state, and saving works after
  return.
- The scenario guards the ownership bug found during this slice: the campaign
  reports the battle result, while `BattleScene.exit()` owns freeing the battle
  `Game`; the same `Game` must not be freed twice.
- Resource-growth counters remain a later lifecycle/reporting improvement.
- Campaign combat handoff tests in `crates/campaign` remain green.

## Must Stay Green

- The campaign sim and save/load contracts do not change.
- Battle restart is still disabled for campaign battles.
- Renderer cleanup does not free wasm game/campaign state prematurely.

## Human Feedback

This slice answers whether the WebGPU port behaves like one game, not two demos.
