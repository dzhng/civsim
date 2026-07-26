# 26 — Audio battle integration + settings + teardown

**Track:** audio · **Gate:** scene boots audio-enabled + Offline/analyser probe
asserts live graph + mute-on-hidden; battle snaps unaffected · **Depends:** `20`–`25`.
**Battle only (D4).**

## Contract
Ambient audio lives in the real battle: starts on the user's first gesture, follows
the camera, is driven by the same wind the grass uses, mutes when the tab is hidden,
and disposes cleanly on teardown.

## API seam
`web/src/battle/battleAudio.ts` — **`BattleAmbientAudio`**: owns an
`AmbientAudioEngine` + `AmbientAudioDirector`; instantiated in `web/src/battle/scene.ts`.
- **Gesture unlock:** `resume()` on the existing battle **start** gesture
  (`scene.ts enter()` ~258).
- **Per-frame:** inside `frame()`, build `MeadowSoundscapeInput` from `camera`,
  `sampleBattleWind` (`01`), `lakeSurfaces`/`oceanPlanes`, and a `grassNear` proxy →
  `director.update(input)`. This is the **only** render-loop coupling and it pushes
  control values only.
- **Visibility:** `ctx.suspend()` on `visibilitychange`/battle freeze (~`scene.ts`
  L2055). **Dispose:** from `BattleRenderer.dispose`.
- **Settings/UI:** `graphicsSettings.audio` (`{ masterVolume, muted, birds, water }`,
  localStorage + `subscribe`); mute/volume control in `mountBattleHud`.

**Battle only** — not wired into campaign (D4).

## Verification
A `web/scenes` battle scene boots with audio enabled and asserts (headlessly, via the
engine's Offline/analyser probe — **not** a screenshot) that the graph is live and
`muted` when `document.hidden`. Battle screenshot baselines unaffected (audio is
silent to the camera; it must not touch `uTime` or any snapshot path). No node leak
on dispose.

## Delegated
HUD control placement; `grassNear` source (reuse grass coverage or a cheap splat
sample); **default-on vs default-muted**, default `masterVolume`.
