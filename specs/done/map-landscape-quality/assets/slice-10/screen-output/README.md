# Graded world with ungraded screen UI — mechanism checkpoint

A shared display target receives the world's normal graded output and the
ungraded screen members. A final copy presents those combined bytes. World
MSAA, tone mapping, source colors and physical camera remain unchanged.
The screen phase reuses the world camera. Battle currently has no members
and keeps its original render path.

The first correction still failed because Three leaves its graded output
bound as the active render target. Restoring only `setOutputRenderTarget`
made the final copy sample its own destination. The corrected phase restores
both target selectors before copying and when drawing throws. The focused
state test reproduces that pinned dependency side effect; it establishes
requested state/order/restoration, while these pixels establish rendering.

## Actual GPU proof

Three sequential frozen modes render known opaque and translucent swatches,
the old graded UI control, and the bare graded world. The repeat explicitly
requests another draw and waits for GPU completion before capture.

- All four opaque colors reach exact authored bytes; label ink248/244/237
  becomes202/200/198 in the old graded control.
- Translucent swatches at alpha0.25/0.5/0.75 match source-over arithmetic
  against the captured graded background within one byte per channel.
- All626972 pixels outside the padded swatches match the bare world exactly.
- The explicit second rendered frame repeats with zero differing pixels.
- No page or GPU-console errors occur.
- Measured initial draw totals are27 screen /26 graded-control /25 bare-world,
  establishing one extra copy draw beyond the existing member draw. Those
  initial totals include world preparation; they are not a steady-frame timing.

The added owned target is RGBA8,4 bytes per drawing-buffer pixel. The final
ungraded canvas copy also uses Three's cached multisample canvas attachment:
at1280×800/DPR1/4×MSAA that is approximately16.4MB plus4.1MB for the display
texture. This is a resource-cost derivation, not measured total GPU memory.
There are two additional presentation passes relative to the old direct world
path (screen members and final copy); the member draw itself was moved, not
added. Existing world shadow/output passes remain.

The mechanism passes six focused state/lifetime tests and frontend typecheck.
Production label/marker, full lifecycle, DPR and performance acceptance remain
separate. The corrected implementation is integrated after the matched production replay
linked from slice10. These mechanism images are evidence, not canonical baselines.


The integrated mechanism also passes on Apple Metal3 through hardware Chrome,
with all opaque/translucent/world-preservation/cost checks and an explicit
rendered repeat passing. `hardware-report.json` records the actual reported
adapter for all four captures. This verifies the output mechanism on that
adapter at DPR1; it does not measure performance or retired-resource collection.

The [merged production frames](merged-production/README.md) isolate the same
output change on the accepted source-band landscape.
