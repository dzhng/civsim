# 22 — Menu Shell And App Composition

## Contract

The normal app shell around WebGPU is complete: menu, loading states, modal
layers, manual, duel picker, save/load buttons, campaign start/load, quick
battle launch, error/fallback messages, and route transitions.

Status: implemented for the normal `/` route. The menu remains DOM by explicit
composition decision, but launch actions are gated by the shared WebGPU support
check and no unsupported browser silently falls through to a legacy renderer.

## API Seam

- `packages/game-renderer/src/appShell.ts`
- `web/src/menu/scene.ts`
- `web/src/main.ts`
  - decides normal route boot, WebGPU capability failure, and fallback UX.
  - publishes `window.__appShellStats` for scenarios.

## Playable Deliverable

- Normal `/` boot shows the WebGPU-aware shell.
- `/?webgpu=off` simulates unsupported WebGPU for the failure fixture.

## Verification

- `VERIFY_WEBGPU=1 node scenario.mjs menu-webgpu-shell`
  - opens menu, launches duel through WebGPU, launches quick battle through
    WebGPU, opens manual, starts the normal WebGPU campaign, and returns.
  - opens `/?webgpu=off`, checks the user-facing message, disabled launch
    actions, and manual availability.
  - opens `/?webgpu=off&battle=5v5` and proves unsupported WebGPU blocks
    renderer deep links at the app shell instead of crashing later.
  - checks Escape/manual behavior and duel picker focus.
- `VERIFY_WEBGPU=1 node scenario.mjs campaign-webgpu-save-load`
  - clears the local campaign slot, proves the menu disables Load, starts a
    normal WebGPU campaign, saves, exits to the menu, loads the save, and
    verifies the reloaded campaign still uses the raw-WebGPU adapter.
- `VERIFY_WEBGPU=1 node scenario.mjs menu-webgpu-shell-visual`
  - pins `menu-webgpu-ready`, `menu-webgpu-unsupported`, and
    `menu-webgpu-duel-modal` baselines.

## Must Stay Green

- Existing menu IDs used by tests keep working until tests are migrated.
- No network dependency is introduced for boot.
- Save/load buttons keep current localStorage semantics.
- Unsupported WebGPU blocks renderer launches without hiding non-renderer menu
  surfaces such as the manual.

## Human Feedback

Review whether the app feels cohesive; the user should not sense a lab bolted
onto an old shell.
