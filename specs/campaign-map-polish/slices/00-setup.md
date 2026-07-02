# 00 — Setup: scaffold + palette telemetry harness

**Contract unlocked:** the spec is wired for measured recolor — a reference target
in place and a `compare-screenshots` yardstick between the current natural map and
the target, so slices 02–04 are driven by channel-deltas, not vibes. No pixel
change to the product.

## API seam
- Filesystem only. Reference already copied: `assets/natural-palette-target.png`.
- Copy it also to `.claude/skills/aesthetics/references/campaign-natural-target.png`
  (the SKILL.md prose that cites it is deferred to slice 19, which lands after the
  code it describes).
- Inventory the addressable campaign scenes (see README Verification) and confirm
  `campaign-lod` snaps `whole-natural` and `whole-political` boot green today
  (baseline capture, no diff).

## What the human can see
- A side-by-side compare (current `whole-natural` vs `natural-palette-target.png`)
  with the per-channel delta readout from **compare-screenshots**. This is the
  yardstick, not a verdict.

## Verification
- `cd web && VERIFY_GPU=1 node scene.mjs campaign-lod` boots and captures.
- Produce the compare-screenshots telemetry pairing `whole-natural` ↔ target.
- No product code touched → whole campaign snapshot suite stays green.

## Stay green
- Everything (no code change).

## Feedback that would change this slice
- If David names a different target look, swap the reference file here before 02.
