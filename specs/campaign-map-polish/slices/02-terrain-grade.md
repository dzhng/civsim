# 02 — Terrain grade: the global tone knob

**Contract unlocked:** overall campaign terrain is muted toward the antique-chart
target — less bright, less vivid, warm-paper sepia band (feedback #1: "colors way
too bright, unnatural"). One variable only: global brightness/saturation/warmth.

## API seam (single owner — terrain palette, invariant 2)
- `packages/game-renderer/src/campaign/mapPass.ts` `grade()` (≈177-184): global
  gamma / saturation `mix(vec3(l),c,1.06)` / lift `c*1.05+0.02` / warm tint
  `*vec3f(1.02,1.0,0.95)`. This is the single biggest knob — tune it alone so its
  effect is legible.
- Pre-grade warm push (≈245) is part of this variable.
- **Firewall:** do NOT touch `naturalCampaignColor()` per-biome constants (that is
  slice 03) or the faction fill.

## What the human can see
- `campaign-lod` snaps `whole-natural` + `regional-italy-natural`, re-rendered.

## Verification
- **Slice variable / crop:** whole-frame *tone* (brightness + saturation + warmth)
  vs `assets/natural-palette-target.png`. Out of scope: individual biome hue
  relationships (slice 03), faction fill (04), labels.
- **compare-screenshots** vs the target: the brightness/saturation delta from
  slice 00's yardstick must shrink.
- **screenshot-critique** last (unprimed): does it read as an antique painted
  chart, not a bright webapp map?
- Expect campaign snapshot diffs — do NOT bless here; baselines are re-blessed at
  the Foundation checkpoint after 04.

## Stay green
- No behavior change; only the palette shader. Scene boots green (diffs expected).

## Feedback that would change this slice
- Direction of the miss (too grey / too warm / too dark) — retune the same knob.
