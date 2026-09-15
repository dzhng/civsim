# Production adapter and shadow integration

The adapter at `ff2f6c4f` preserves its explicit frame preparation. Rendering calls
`setFrameCamera`, fits the shared sun to that camera, then submits standards and
crowd. The frame used for cards and picking remains the presented frame.

All519 web tests, typecheck and production build pass on the merged tree. Merged campaign-production, physical-overview and composition smoke passes all
behavior, DPR, picking, card, fog and no-error checks. Ten snapshots differ after
the shadow integration; their actual images are preserved under pre-aerial-smoke.
Final visual acceptance/repeats follow the atmospheric-ray fix, so these images
are not re-pinned yet.
