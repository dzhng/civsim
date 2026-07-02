# 19 — /aesthetics updates (doc lands after its code)

**Contract unlocked:** the aesthetics skill records the two intended changes, each
*after* the code it describes has shipped, so the doc matches reality.

## API seam (docs only)
- **Part 1 — natural-palette target (gated on the Foundation checkpoint, 04):**
  the image is already copied to
  `.claude/skills/aesthetics/references/campaign-natural-target.png` (slice 00).
  Add a reference line to `.claude/skills/aesthetics/SKILL.md` naming it as the
  campaign natural-palette north star (the muted antique-chart target).
- **Part 2 — two-color rule rewrite (gated on slices 18 + 17):** the current
  "two-color rule" says allegiance is the icon color (green/amber/red). Rewrite it
  for the shipped model: **icon = faction color always**; allegiance is conveyed by
  the label treatment — OWN = bronze card, NEUTRAL = engraved faction-icon label,
  ENEMY = red sword. Update the campaign UI-icons note accordingly.
- **Discipline:** follow **write-docs** — the skill is taste guidance, not an
  implementation map; no stale file paths / line numbers / constants.

## What the human can see
- The SKILL.md diff + the new reference image in place.

## Verification
- Doc review; confirm the two-color-rule section no longer contradicts the shipped
  icon/card/sword model. No snapshot.

## Stay green
- N/A (docs). Ensure no other skill sections were disturbed.

## Feedback that would change this slice
- David refining the wording of the new allegiance model.
