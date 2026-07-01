# B4B1A1U decision - rejected

Date: 2026-07-01.

Judged variable: field-fiber close-body source topology inside the fixed B4B1A0
close lab. Camera, terrain, meadow/root material, crop windows, palette, fog,
atlas content, primitive family, and full reference composition stayed frozen.

## Verdict

Reject B4B1A1U. Dense field-cell/subcell micro-sources prove that the renderer
can emit many deterministic non-card fiber records from field cells, but the
visual still does not preserve continuous close grass body. The new sources
create isolated clumps and marker/ruler spacing over smooth ground, not the
target's dense overlapping foreground grass.

## Evidence

- Contact sheets:
  - `variant-contact-sheet.png`
  - `variant-crops.png`
  - `selected-field-subcell-full.png`
- Raw/crop captures:
  - `raw/full/*.png`
  - `raw/close/*.png`
  - `raw/tight2x/*.png`
- Metrics:
  - `compare-target/visual-parity-diff.json`
  - `compare-rejected/visual-parity-diff.json`
  - `stats.json`

Against the target close crop, the rejected B4B1A1T per-record context has
`0.08915x` target edge energy. The source-topology variants improve that only to
`0.16591x` (`subcell-dense`) and `0.21339x`
(`subcell-broken-spacing`). That is a measurable increase, but still far below
the target's dense blade/body edge structure, and the added edge appears in
discrete clumps rather than a continuous body.

Against the rejected per-record fiber context, `subcell-dense` has `1.861x`
edge energy and `subcell-broken-spacing` has `2.39355x`. The extra source
records are visible, but as isolated patches and posts. The selected dense
variant emits `7200` records from `900` source cells at `8` micro-sources per
cell, submitting `1036800` triangles. The alternate emits `7600` records from
`760` source cells at `10` micro-sources per cell, submitting `1094400`
triangles. Counts alone are not the missing body architecture.

## Neutral critique

The unprimed screenshot critique agreed:

- no candidate preserves the target's continuous close grass body;
- all candidates remain mostly flat green field with occasional isolated tufts;
- marker-post spacing dominates the foreground;
- the subcell variants still show discrete rectangular/stripy clumps;
- the selected full shot reads as topology markers over a field, not close grass.

## Next seam

Do not continue to B4B1A2 perf, B4B2 coverage, palette, LOD, fog, terrain,
water, cliffs, camera-relative generation, or full-reference compose from this
result. Continue at
`slices/03b4c5b4b1a1v-continuous-strand-body-representation.md`: the next slice
must change the body representation itself. It should try a continuous,
ground-seated strand/body layer that creates dense close mass without returning
to atlas cards, hay-mat curtains, or debug-marker posts.
