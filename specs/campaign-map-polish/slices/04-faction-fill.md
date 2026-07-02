# 04 — Faction fill: de-mud + single alpha owner

**Contract unlocked:** faction view reads as a clean translucent color wash of
each faction's own color over the recolored terrain — not the muddy brown of
feedback #3 (Rome). This closes the Foundation look.

## API seam (single owner — faction-fill material, invariant 3)
The muddy brown has two causes, both fixed here:
1. **Warm-tan tint:** `packages/game-renderer/src/campaign/territoryPass.ts`
   fragment returns the faction texture RGB directly, without mixing toward tan.
2. **Three stacked alpha owners:** per-texel alpha is neutral
   (`FILL_A=255` in `territory.ts:51`), and the territory pass alpha is the
   only opacity knob. The controlled-stage default preserves the previous net
   opacity; the main map passes its own provisional wash strength.
- **Firewall:** must NOT re-tint terrain in `mapPass` to compensate (that would
  fork the palette owner). Hue-vs-alpha are the two knobs; both live in this
  material.

## What the human can see
- `campaign-lod` `whole-political` + `regional-italy-political` (faction view on).

## Verification
- **Slice variable / crop:** faction-fill *hue + wash strength* over several
  adjacent factions. Target: `.claude/skills/aesthetics/references/campaign-map-political-borders.png`
  (clean translucent washes). Out of scope: belligerent hatch (optional, later),
  labels, terrain palette (frozen from 02/03).
- **compare-screenshots** vs the political-borders reference AND feedback #3
  (`assets/feedback/03-...png`) to confirm the brown is gone.
- **screenshot-critique** last.

## ★ Foundation human checkpoint (non-blocking)
After 04, open `whole-natural` + `whole-political` (in slice-01's clean frame)
with **preview-shots** for David. Give ~5 min. If silent, decide on the
compare-screenshots evidence, record the decision + rationale in the README, close
the shots, and proceed. **On sign-off, re-bless the entire campaign snapshot
baseline set** (`UPDATE_SHOTS=1`) — every later visual slice diffs against the new
palette.

## Stay green
- Faction-fill material only; campaign scenes boot (diffs expected → blessed at
  checkpoint).

## Feedback that would change this slice
- "washes too strong/weak" → the single alpha knob. "belligerent emphasis wanted"
  → add a hatch overlay as a follow-up slice (aesthetics: reference-faithful hatch,
  not louder fill).
