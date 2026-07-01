# Slice 7 — Polish + Total War fidelity (follow-ups)

The core card bar shipped (S1–S4, S6): a fixed-size, no-scroll, auto-stacking
Total-War strip of cards, each a baked 3D-model portrait that fills the 3:4 card
on a dark backdrop with name / count / live bars overlaid, clearing the minimap
and gated behind a min window size. These are the open polish items — mostly from
the unprimed screenshot-critiques and David's taste checkpoints. None block the
feature; each is independently shippable. **This is the goal for the next pass.**

## Required: make it read as a GAME, not a webapp

**In progress (first cut landed).** The bar now has an opaque worn-bronze chassis
(beveled brass edge, recessed dark tray) framing inset card wells with warm
bronze-brown interiors (the portrait backdrop was re-baked warm — no more cool
slate), figures popping, gold-glow selection. The webapp tells (transparency,
floating rounded cards, no frame, flat/cool) are gone. **Still open toward the
reference:** frame ornamentation (corner pieces / worn-metal texture), the green
**top strength bar**, and a **role medallion** (the last two are the David-call
deltas below). Keep closing the gap to `assets/reference-tw-cardbar.png` under the
README's **Aesthetic contract** and
[aesthetics](../../../.claude/skills/aesthetics/SKILL.md):

- Replace the transparent gradient strip with a **solid, opaque bronze/metal
  chassis** that frames the whole row (beveled frame + corner ornament; a 9-slice
  or baked frame asset, or richly layered CSS — flat CSS rules won't get there).
- Cards become **abutting inset wells** (rim light + inner shadow, recessed
  portrait), not free-floating rounded rectangles with gaps and hairline borders.
- Materials are bronze/iron/leather/bone, warm and worn — not slate-grey neutrals.
  Selection is a warm **gold glow/frame**, not a crisp UI outline.
- Kill every web tell: no `rgba`/gradient transparency, no hover-lighten, no pill
  buttons, no webapp rounding.

Gate: **compare-screenshots is blocking on the aesthetic contract** — a clean grid
is not enough; the candidate must visibly move toward the reference's chrome.

## Critic callouts (integrated-bar review) — resolved

- **Infantry blur at card size — RESOLVED (the name carries it).** At 72px the
  swordsman looks read as "an armored man with a weapon" and the **unit name** does
  the disambiguation (it's right there on the card). Per-*class* bakes (≈30 PNGs
  for a marginal silhouette gain) are deferred; the portrait sets the vibe, the
  name names the unit.
- **Artillery reads as a siege engine — ACCEPTED.** The artillery look *is* the
  engine (ballista/cart), so its card shows the engine — correct, not a defect. If
  a crew-anchored framing is ever wanted it's a re-bake, not a blocker.
- **Reference deltas — resolved (non-blocking calls, documented):**
  - **Top strength bar — DONE.** HP now runs across the card top with the count
    riding on it (the reference silhouette); cohesion + morale stay at the bottom.
  - **Role medallion — DEFERRED.** Phosphor lacks spear/bow/pike weapon icons, the
    name already disambiguates, and a medallion duplicates the portrait + name.
    Revisit if a weapon-icon set is added.

## Other open polish

- **Portrait framing fine-tune.** Some heads sit close to the top edge. Nudge the
  per-look `LOOK_H` / zoom in `web/shots/models/scripts/soldier-cards.mjs` and
  re-bake. David's framing checkpoint.
- **Faction-variant portraits (deferred).** Portraits bake team-0 (blue) only;
  enemy cards rely on the `--fac` CSS border. If a neutral body reads as the wrong
  side at small size, bake a team-1 (red) set (the `-t1` filename hook) and pick by
  team in `cardThumbUrl`.
- **Constants sign-off.** `cardW 72`, `maxRows 3`, `MINIMAP_RESERVE 210`,
  `MIN_WINDOW 1180×640`, and the placeholder copy are all tunable, awaiting
  David's eyeball at the real battle camera.

## S5 (optional, still open)

Dedupe the two `.ucard*` CSS copies (`web/index.html` `<style>` + the lab
`installStyles`) — held up by the HTML-vs-TS-injection mismatch; do it only if a
clean shared source emerges. Optionally reconcile `scene.ts`'s raw-offset unit
reads onto `buildBattleUiModel` (camera-centering side-effect risk — the spec's
decision #3 keeps it optional).

## Verification

Every visual change re-runs the standing gates — [compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md)
against the reference and an unprimed [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) —
opens the shots for the user with [preview-shots](../../../.claude/skills/preview-shots/SKILL.md),
and re-blesses `card-bar-*` + the GPU `battle-selection-dpr2`. GPU bakes/renders
run headful with hardware flags (no headless WebGPU adapter on this machine).
