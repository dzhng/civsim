# Feedback Baselines And Scene Harness

## Contract

Every campaign-polish issue has a named scene or crop that can be regenerated
and compared against the feedback image. The first checkpoint is evidence, not
art tuning.

## API Seam

- `web/scenes/campaign-webgpu-lod.mjs`
- campaign debug hooks exposed through `window.__campaign`
- screenshot assets under `specs/campaign-polish/assets/user-feedback/`

## Human Review

Open the generated close Rome, central Italy, and mountain/forest crops beside
the three feedback images. The reviewer should be able to point at the same
city, label, road, mountain cluster, and terrain color problem in both.

## Verification

- Add or update scene outputs for the three attached feedback views.
- Store only the focused review crops in this spec if they are used for
  judgment.
- Keep full generated snapshots in the normal `web/shots` harness location.

## Done

- [ ] The three feedback images are referenced by a scene/crop checklist.
- [ ] Close Rome verifies Ostia/Portus label and road visibility.
- [ ] Central Italy natural verifies green terrain, mountain/forest visibility,
  and label spacing.
