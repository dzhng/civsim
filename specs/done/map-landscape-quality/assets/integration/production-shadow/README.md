# Production adapter and shadow integration

The adapter at `ff2f6c4f` preserves its explicit frame preparation. Rendering calls
`setFrameCamera`, fits the shared sun to that camera, then submits standards and
crowd. The frame used for cards and picking remains the presented frame.

All519 web tests, typecheck and production build pass on the merged tree. Merged campaign-production, physical-overview and composition smoke passes all
behavior, DPR, picking, card, fog and no-error checks. Ten snapshots differ after
the shadow integration; their actual images are preserved under pre-aerial-smoke.
Those earlier images remain the shadow-only control; final acceptance is below.

The shared aerial-ray correction is integrated at `4e2f5997`. The final ten
captures under `post-aerial-smoke` pass all behavioral checks. A fresh reviewer
accepted this bounded integration with moderate confidence: city/army contact,
water continuity, label spacing and panel clipping show no new blocker. Softer
attached shadows slightly improve the frame. Large selection rings, pale overview
wash, angular roads and simplified props remain existing quality limitations;
roof banding remains a lighting follow-up. This is not reference-quality acceptance.

`aerial-comparison.json` isolates the atmospheric correction against the earlier
merged capture. Controlled oblique frames differ only at rounding level; the
physical overview changes materially where the incorrect aerial ray produced its
rectangle. Paired crops are under `review-crops`. All ten accepted baselines repeat with zero differing pixels through the same
three existing scenes. Every behavioral check passes; no page errors occurred.
The [snapshot ledger](snapshot-ledger.md) accounts for each moved pin;
`first-capture-report.json` and `repeat-report.json` preserve the gate results.
