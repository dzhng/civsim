# 2026-06-28 Campaign Blocker Feedback

User feedback screenshots were sent from macOS `TemporaryItems` paths that were
already cleaned up before they could be copied verbatim into the repo. The
three preserved images in this folder are current scene captures covering the
same problem areas; the bullets below record the exact issues from the original
screenshots and should be treated as acceptance blockers.

## Images

- `01-close-rome-ostia-road-label-current.png` - close Rome/Ostia region.
- `02-tibur-label-road-spacing-current.png` - Tibur/city-label spacing region.
- `03-mountains-roads-trees-current.png` - central Italy mountains/roads/terrain
  region.

## Issues To Fix

- The city southwest/bottom-left of Rome, Ostia/Portus, must keep both its label
  and road visible. Do not let label collision, road filtering, or city aprons
  erase it again.
- City labels are too far from city icons/models. The margin between city icon
  and label should be about one label/icon height, much closer than the current
  layout.
- Close and regional natural terrain still reads too brown compared with the
  previous campaign renderer. Green terrain readability remains a blocker.
- Mountains are not visually accepted yet. They look chunky/ugly in places,
  cover or compete with cities and roads, and can collide with labels.
- Trees and forests are still not visible enough in the campaign acceptance
  scenes.
- Carts or other road-life props are still missing; road traffic needs its own
  deterministic scene and acceptance evidence.

## Process Note

Every future visual-feedback screenshot from the user should be copied into a
dated folder under `specs/webgpu-skinned-crowd/visualizations/user-feedback/`
before the temporary source can disappear. Add a short issue log like this one
and link it from the relevant slice.
