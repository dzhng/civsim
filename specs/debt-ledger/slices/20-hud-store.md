# 20 — hud-store

**Contract unlocked:** HUD state has one owner per scene that React subscribes
to; scenes stop hand-rolling diff keys; graphics settings have one hook. The
documented ≤5 Hz firewall between the sim loop and React (`BattleHud.tsx:6-14`)
is kept as the cadence at which scenes call `set`.

## Seam

```ts
// web/src/ui/hudStore.ts
export interface HudStore<T> { get(): T; set(next: T): void; subscribe(cb: () => void): () => void }
export function createHudStore<T>(initial: T): HudStore<T>;       // Object.is on set is the firewall
export function useHudStore<T, S>(store: HudStore<T>, select: (t: T) => S): S; // useSyncExternalStore
// web/src/shared/graphicsSettings.ts
export function useGraphicsSettings(): GraphicsSettings;          // replaces BattleHud.tsx:108 + GraphicsSettingsModal.tsx:29
```

- `getGraphicsSettings()` clones per call (`graphicsSettings.ts:49`) and
  `subscribeGraphicsSettings` never emits the initial value. The store must
  keep a cached snapshot with stable identity, or `useSyncExternalStore`
  loops; the hook reads `get()` synchronously.
- `CampaignTopBarProps` (`CampaignTopBar.tsx:4-20`, five booleans) →
  `{ state: CampaignTopBarState; on: CampaignTopBarActions }` read from the
  store. Scene-side diff keys (`battle/scene.ts:763-793`,
  `campaign/scene.ts:1091-1147`) are deleted.
- HUD DOM ids and CSS are untouched: scenes read `.ubanner-flag`, `#pause-exit`,
  `#gameover-menu`, `#toolbar button[data-cmd]`, `.cmp-*`, `#menu-*`,
  `.renderer-unitcards .ucard`.

## Decisions resolved here

Store per scene; React reads via `useSyncExternalStore`; the ≤5 Hz `set`
cadence stays with the scene.

## Delegated to the implementer

Whether the card grid (60 Hz path) uses the same store or keeps its imperative
handle (it is a different firewall; keeping it is fine).

## Verification

- Vitest `hudStore.test.tsx` (RTL): render count ≤ `set` calls; no render on
  identical value.
- `BattleModals.test.tsx`, `graphicsSettings.test.ui.ts`.
- G-verify (`battle-3d-standards` counts `.ubanner-flag`; `campaign-handoff`
  reads `#pause-exit`), `menu-renderer-shell*`, `card-bar`; `shots/ui/*` at
  **0 px**.

## Must stay green

All HUD-reading scenes.

## Feedback that would change this slice

None.
