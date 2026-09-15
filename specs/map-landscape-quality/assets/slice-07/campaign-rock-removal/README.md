# Campaign rock props

Real geography now leaves mountain mass to the terrain and no longer scatters
the disconnected blue-gray rock props. Authored controlled-stage rocks and the
shared battle asset remain. The old coarse-grid producer and its unused limits
are removed; there is no runtime filter or new setting.

The normal campaign route was captured at fixed Alpine, Italian and close Alpine
views with production lighting and overlays. Cameras and tick 0 match; every
non-rock source record is exact. The global source list loses 973 rocks. Changes
are visible in all three images (7,696, 2,268 and 17,557 pixels respectively), and
all three candidate captures repeat with zero differing pixels. No page errors.
Reports retain every snapshot verdict and hashes of the larger original source
records; the comparison reports record exact tree identity.

An unprimed reviewer inspected all six production frames and the reference and
preferred the candidate: high confidence close, moderate wide. The cool faceted
clusters conflicted with the soft terrain; removing them improves continuity.
The reviewer found no new coastline, tree, road, placement or label regression.
The visible tradeoff is emptier exposed slopes. Soft relief, oversized trees,
white roads and insufficient surface variation still fall short of the reference.
This accepts removing these props, not final mountain or landscape quality.

## Verification ledger

- New woodland regression: source rock coverage previously emitted props; now
  none are emitted, while woodland records and source arrays remain unchanged.
  The old producer fails the new behavior; existing clearance checks stay green.
- LoD density: keep zero mountain props, allocated terrain and at least 2,400 trees. Replace
  at least 700 rocks with zero rocks. Remove the combined 3,100 floor (2,400 trees + 700 rocks),
  preserving the woodland floor. Pixel, road, label and timing gates are unchanged.
- Focused woodland/scenery checks: 12 pass; matching-WASM typecheck passes.
  Independent code review's stale-LoD-gate finding is resolved above.
- Separate known campaign color/label/card acceptance findings remain open; this
  pass does not repin their baselines or lower their thresholds.
