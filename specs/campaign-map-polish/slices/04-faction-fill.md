# 04 — Faction fill: de-mud + single alpha owner

**Contract unlocked:** faction view reads as a clean translucent color wash of
each faction's own color over the recolored terrain — not the muddy brown of
feedback #3 (Rome). This closes the Foundation look.

## API seam (single owner — faction-fill material, invariant 3)
The muddy brown has two causes, both fixed here:
1. **Warm-tan tint:** `packages/game-renderer/src/campaign/territoryPass.ts`
   fragment (40-45) mixes the faction color toward warm tan `(0.92,0.74,0.42)` by
   `__TERRITORY_WARM_MIX__`. Drop it to ~0 so the faction color passes through.
   (`web/src/campaign/renderer.ts:574-583` sets main-map `warmMix:0.015`.)
2. **Three stacked alpha owners:** net alpha ≈ `__TERRITORY_ALPHA__` (0.24
   default, renderer overrides 0.55) × per-texel `FILL_A=150` (`territory.ts:51`).
   **Collapse to one authoritative knob** — nominate the renderer-side `alpha`,
   pin `FILL_A` and the pass default to neutral (1.0) with a comment. Then tune
   the single alpha for a translucent-wash strength.
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
