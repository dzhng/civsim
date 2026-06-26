# Slice 00 — Survivability compression (independent; start here)

## Contract
Survivability is a **designed ladder, bounded** — not a runaway axis. The ladder
(David, after measuring): a frail levy → a HEAVY is **~4×** (a peasant should
barely scratch a heavy — wanted), but a LIGHT/MEDIUM line → a HEAVY is **≤ ~2×**
(the fighting classes stay close). An equal 1v1 grind resolves in **~3–4 min**.
A *balance compression*, independent of the arc spine (01–05).

> The original framing was a flat "best ≤ 2× worst." It was reframed once the rig
> existed: a strong shield (block ~0.5) SHOULD make a heavy ~4× a levy; the thing
> to bound is the gap *between the fighting classes* and the absolute grind pace.

## Why (the runaway, measured)
A HeavySword combines high HP **and** high block: ~2× HP × ~0.5 block vs a
Peasant's 1× HP × 0 block. In a CHARGE (block at full strength) that reads ~5×;
in a sustained GRIND guard fatigue erodes the block to ~3.7×. The ~4× heavy-vs-
levy gap is the design; the failure mode to prevent is it growing *unbounded*
(an unkillable line) or the fighting classes drifting apart by more than ~2×.

## Step 1 — HP rescaled into [1,2] (DONE)
`class.rs`: the WHOLE distribution was rescaled `[1.0, 2.4] → [1.0, 2.0]` (each
unit's above-1 HP × 0.714), not just the top clamped — clamping alone collapsed
the heavy/medium distinction (both hit 2.0). Now: Peasant 1.0 · light missile 1.12
· foot/horse-archer 1.21 · long-sword 1.35 · light-sword/shock-cav 1.36 · light-
spear 1.39 · medium 1.68 · phalanx 1.86 · heavy 2.0. Orderings and proportional
gaps preserved; full span exactly 2×. Keep new classes in-band — design rule now.
- Open question: `mount_health` (ShockCav 5.0, HorseArchers 6.5) is the HORSE's
  soak, a separate axis — left out of the [1,2] clamp for now; revisit cav
  survivability as its own question.

## Step 2 — measured, and the target was REFRAMED (DONE for foot)

David revised the goal after seeing the measurements — it is **not** a flat 2×
ceiling. The designed ladder is:
- **frail levy (Peasant) → HEAVY ≈ 4×** — a peasant should *barely scratch* a
  heavy. That gap is WANTED. block ~0.5 on a 2× HP body earns exactly this.
- **light/medium → HEAVY ≤ ~2×** — the fighting classes stay close.
- **block stays ~0.5** — a big shield should be strong; do NOT nerf it. The lever
  for the absolute pace is turning ATTACK up, not shrinking the shield.
- **the heavy sword holds the HIGHEST block** — Phalanx was 0.55 (above heavy's
  0.50); lowered to **0.45** so heavy is the shield cap.

### The rig (built): `tests/mechanics_survivability.rs` — a MECHANICS test
**Every assertion is on FAKE reference units** (`ref_stats` + a test-owned
`REF_BLADE`), never on real classes — so David can retune any real class freely
without breaking it. Real classes are printed as DIAGNOSTICS only. Two readouts:
- **lethality anchor** — an equal, wide-shallow LINE grind of a reference soldier
  (HP 1.5, light shield) must last **~3-4 min**. This pins `REF_BLADE.damage`
  (=0.32) as "about the attack level a 3-4 min grind needs." The stock game sword
  is 0.5 → the same line grinds in ~2.2 min, so real melee runs a touch HOTTER
  than the anchor at wide-line scale. (The old "10 min" was a DEEP-block artifact;
  a real battle line is wide and shallow — David's correction.)
- **survivability scaling** — pure-HP references (HP 1/2/4) confirm HP is ~linear
  (HP2≈1.85×, HP4≈4.71× — mildly super-linear), and a 0.5 shield is a real but
  BOUNDED multiplier (≈1.6× a bare body, < a whole extra HP — guard fatigue erodes
  it over a grind, which is why a heavy reads ~4× in a grind and ~5× in a charge).

### Diagnostic — where the real roster lands (formation-fair, ×HP1-ref)
Peasant 1.04 · LightSword 1.84 · MediumInfantry 2.37 · MediumSpear 3.08 ·
**HeavySword 3.44** · HeavySpear 3.93 · Phalanx 10.7. The ladder is healthy:
heavies on top, **heavy/light ≈ 1.9×** (≤2× ✓), **heavy/peasant ≈ 3.3–3.8×** (~4×
✓). block 0.5 well-calibrated; no block compression needed.
- **Why a SPEAR out-survives a SWORD of the same tier** (David's question):
  it is the spear's REACH (1.6 vs 1.0), a mini-standoff that holds the attacker a
  little further off, plus brace lowering crush → evade holds. The TRADE is
  offence: a spear hits for **0.2375 vs the sword's 0.5** (~half), and the rig only
  scores defence. So HeavySword (more HP, more block, 2× the damage) is the
  stronger unit; HeavySpear merely *survives* a touch longer. Not a bug. (An
  earlier rig showed MediumSpear *above* HeavySword — that was a deep-formation +
  hot-damage artifact; the formation-fair rig puts HeavySword back on top.)
- **Phalanx 10.7× is the PIKE STANDOFF, not the shield** — proven earlier (its
  stats on a sword body read ~4.3×). David: pikes are fine. Excluded from the
  reference assertions by construction (it's a real class, only printed).

### Open for David
- **Real melee runs ~2.2 min at wide-line scale vs the 3-4 min anchor** — a touch
  hot. Leave it, or shave weapon damage ~0.5→~0.35 toward the anchor? (A balance
  call; the reference now tells you the target range.)
- Spear over-survival is the intended reach/offence trade — no action unless you
  want it flatter.

## Must stay green (or be re-derived with David)
The HP rescale and the Phalanx block 0.55→0.45 both move balance pins (heavy-vs-
light matchups, cav-charge survivor bands, any Phalanx-shield pin) and the **golden
hash** (sim-value changes). Re-derive those WITH David against the new roster —
don't pre-fix, and re-pin golden ONCE the survivability/lethality work settles (it
will keep moving while tuning).

## Feedback that changes this slice
The ladder numbers (4× heavy-vs-levy, ≤2× within the fighting classes, ~3–4 min
grind) are David's; this slice owns the *mechanism* (a bounded survivability ladder
+ a measured grind length, anchored by fake reference units) and the rig that pins
them. Still open (above): army-scale grind lethality, the pike frontal wall, spear
over-survival.
