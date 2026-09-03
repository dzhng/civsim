# 21 — scene-boot-helpers

**Contract unlocked:** scenes boot worlds through one helper; URL params that
nothing reads are gone.

## Seam

- `web/scenes/worlds.mjs` gains:

  ```js
  export async function campaign(ctx, kind /* 'test'|'handoff'|'alignment'|'new' */, opts)
  export async function labRoute(ctx, route, query)
  export async function ready(page, flag, timeoutMs)
  ```

  Migrate the hand-rolled boots: the three `?battle=5v5&ai=off` scenes
  (`battle-3d-standards.mjs:24`, `battle-minimap.mjs:27`,
  `battle-input.mjs:27`), the 18 `__campaignReady` polls
  (`campaign-save-load.mjs:27-29`, `campaign-lod.mjs:88-94`, …), and the lab
  route boots in `renderer-lab-routes.mjs`. URLs must not change — the URL is
  the world.
- Delete URL params with no live reader: `grassQuality` / `grassquality` /
  `grass-quality`, `grass`, `nofar`, `fargrass` (`graphicsSettings.ts:76-98`);
  `?measurecards` (`battle/scene.ts:1166`, writes `__cardUpdateSamples`);
  `?sea` if slice 13 did not already; the `gfx=` probes scenes send that
  nothing reads (`battle-renderer-default.mjs:98`,
  `campaign-production.mjs:118`).

## Decisions resolved here

The boot helper wraps `goto` + `ready`; it never changes a query string.

## Delegated to the implementer

Which of the 71 `page.goto` sites migrate now versus stay (all should, but
scenes that build unusual URLs may keep a direct `goto` with `ready`).

## Verification

- G-verify, G-verify-full, G-camp, G-lab at **0 px**.
- `grep -rn "waitForFunction" web/scenes | wc -l` drops by at least the 21
  migrated sites.

## Must stay green

Every scene.

## Feedback that would change this slice

None.
