# Melee Blob — formation adherence while engaged

Engaged foot units blob: the fighting seam is a deep interdigitated band, both
units wrap each other simultaneously so the whole engagement pinwheels into a
diagonal lens, and rectangles melt into ellipses. `crates/sim/tests/`
`mechanics_melee.rs:619-620` already names this feature: the pinned vibe
regressions there defer to "a concurrent 'kill the melee swirl' effort" — this
spec is that effort.

**Binding target (David, 2026-07-02):** *"Front dissolves, bodies hold."* A
churning mixed seam band 2–3 men deep is acceptable; the two unit bodies behind
it must keep shape and must never pinwheel. Priority: (1) bound the seam
interpenetration, (2) kill the rotation, (3) silhouette. **Churn budget:
foundation rebuild authorized** — but only on instrumented proof (triggers in
Risks), never as the first move.

## Next Agent Prompt

*Status (2026-07-02): slices 01–04 COMPLETE and RESLICED. Slice 04 named the
mortal unlock: cap-clips-the-spring. SpeedCap removes PivotSpring-aligned
steering in both runs, but mortality amplifies it (mortal avg
parallel-of-total clip 0.775 vs immortal 0.689; ramp window peak 0.907 vs
0.690), so the restoring spring is preferentially eaten while the residual
drift survives. Off-axis mass chase, re-dress legalization, and forward-close
feed were killed. Pickup point: slice 05 — fix the cap/spring feedback without
weakening the now-active seam-band rail.*

You are implementing this spec. Slices 01–03 (harness, metrology,
attribution) are landed — read their slice files' bottom notes and the
verdict table below before anything else. David's standing directive: this
is a deterministic simulator; measure with the force-trace harness before
theorizing, no trial-and-error knob sweeps. The next pickup is
`slices/04-mortal-orbit-attribution.md`; slice 05 implements the fix its
verdict names; 06/07 handle pike-void and silhouette residue after the fix;
08 re-blesses and closes. Read `.claude/skills/tweak-mechanics/SKILL.md`
(and its references/force-trace.md) before touching sim code. Rebuild wasm
before filming anything. Update this section (status, pickup point, TODO)
before ending your pass.

- [x] 01 force-trace — every force channel recorded at its source, ledger + torque/crossing queries; tweak-mechanics skill updated
- [x] 02 metrology — detectors + probes + ignored pins + seam-timeline.html; seam band does not reproduce sustained, rotation does
- [x] 03 attribution — verdicts measured; band/chirality/pike-owner killed; orbit is mortal-only; **resliced**
- [x] 04 mortal-orbit attribution — cap-clips-spring named as the unlock; off-axis mass chase / ratchet timing / forward-close feed killed; band rail active
- [ ] 05 orbit fix — per 04's verdict; the equilibrium must settle; the re-dress-off ±180° blow-up must also heal
- [ ] 06 pike void — re-measure after 05, diagnose residue fresh (owner hypothesis dead)
- [ ] 07 silhouette — residue after 05–06 (vibe-like floor today: 0.62)
- [ ] 08 re-bless, change-report ledger, standoff-rider 1v1 pin, close-spec

## Evidence

`assets/before-*.png` — 4× crops of the accepted baselines David judged
(heavy-both t060/t160/t300, pike-v-pike t060/t200), from
`web/shots/vibe/heavy-both/` and `web/shots/vibe/pike-v-pike/`. What they show:

1. **Deep seam** — the fighting line is a mixed red/blue band 4–6 men deep, not
   two walls grinding (heavy-both t060 onward).
2. **Pinwheel** — both units wrap each other's flanks at once; the engagement
   rotates into a diagonal lens, and **both matchups rotate with the same
   handedness** — the signature of a deterministic chiral driver, not seed noise.
3. **Corner/edge melt** — rectangles round into ellipses; rank/file legibility
   is gone within ~3 ranks of contact.
4. **Pike lens void** — pike-v-pike t060: the seam bows apart mid-line while
   both ends are in body contact.

The vibes are mortal, morale-on, `micro_rough` on. Every green mechanics
invariant covering this ground is immortal, morale-off, parade-ground — the
mortal casualty feed (`compact_columns` closes every hole *forward*, straight
into the band) is measured by nothing.

## The force stack (recon, verified 2026-07-02)

An engaged foot soldier feels, in tick order — steering
(`Sim::steer_soldiers`, sim.rs:1539–2561): the neighbour weave (`net_target` ×
`weave_stiffness` 3.0) with exponential `comp_push`; the pivot spring
(`pivot_stiffness` 4.0, the only within-unit anti-shear force, its lever
capped only for mounted/narrow per column-closing); the **enemy bond**
(sim.rs:~2016, rest = `reach_u` = max over ALL weapons, weld + inside-reach
push, only for his ONE `fighting` target); slot pull (0.2/0.8, hardcoded 0.65
engaged lean — backlog Tier-2 #5); the forward-corridor clamp (backlog Tier-1
#1, fires only inside the foe's lateral corridor — flank files keep full
cruise); the enemy **magnet** (3.0, fades at reach, gated on `front_clear`,
with the `seeking_flank` overhang curl — the wrap driver); the fighting-pace
cap (toward-foe only; **lateral is free by design**). Collision
(`apply_separation`, collision.rs): mass/brace-shared non-overlap where every
**friendly** pair's push is rotated by a fixed handedness
(`separation_slide` 0.3, collision.rs:272-273 — the one always-on chiral force;
enemy slide = 0) plus a ±0.01 index tiebreak (collision.rs:491); the
**weapon repel** (collision.rs:517-686) whose standoff is **frontal-only**
(`dot > 0.55`, :617-631) and nearest-foe-per-column — flank contacts get zero
standoff by design; the hard wall (snap out of the single deepest enemy body —
it cannot see inter-file corridors). Combat: sticky targeting; `front_clear`'s
blocked cone is 1.2 m ±26° (combat.rs:452-455) — porous in a churning seam;
`hit_push` (0.3 × mass-ratio, a named crutch); `gang_cap` 3 (shove kept, wound
denied — packs bodies; not a lever, per its comment). Unit frame: engaged
frames drive at 0; **contact facing freeze** at `engaged_frac > 0.08`
(sim.rs:2603) — all rotation is positional, the commanded frame cannot follow;
anchor leashed to the men; and the **engaged re-dress**: `engaged_deep_reform`
(sim.rs:918-952) runs `reassign_slots` (world-position sort) every 60 ticks
while engaged when >half the files fight and ranks ≥ 5 — the column-closing
carve-out.

## Detector blindness (why the wall is green while the shots are wrong)

- `interpenetration()` (mechanics_melee.rs:67) measures the **fraction** of men
  with an enemy within 1.2 m, not band **depth**; a 3-rank band on a 10-deep
  block reads ~0.26 and passes the 0.30/0.40 pins. Immortal-only.
- `max_facing_dev_deg` reads `u.facing`, which the contact lock **freezes**
  during exactly the grind that pinwheels. `depth_ratio` is PCA
  rotation-invariant on purpose. Centroid-gap fires only on full pass-through.
  **Nothing measures the men's actual seam or lattice orientation.**
- Cohesion (0.38 floor) is strain-vs-slot-labels — and the engaged re-dress
  re-legalizes the melted shape every 2 s.
- Nothing reads the front-gap profile along the seam (mid vs wings).

## Hypotheses (ranked; 03 adjudicates)

- **H1 — seam band: the hold is target-scoped and one-sided.** Only a
  `fighting` man's one bond plus the weak frontal sword standoff (softness 0.2)
  resist interleave; a man past the front, or whose target died, is held by
  nothing but the hard wall, which ejects him into the next corridor.
  `front_clear` goes porous as the seam churns; lateral is uncapped; the mortal
  casualty feed refills the band from behind. This is the **proven** braced-wall
  "front zipper" of `specs/standoff-double-push.md` in weak form.
- **H2 — pinwheel torque: mutual flank wrap is unopposed.** Both units grow
  overhangs; `seeking_flank` + magnet curl them in; flank contacts have no
  standoff (frontal gate); facing is frozen; the anchor follows the men; the
  pivot spring is local. Torque with no counter-torque, and tilt disables more
  standoff (dot < 0.55) → runaway. Likely a non-settling equilibrium: rotating
  is the only way left to reach an anchor it can't reach straight on.
- **H3 — pinwheel chirality seed: the friendly slide.** The same rotation
  direction across different matchups needs a deterministic seed; the
  fixed-handed `separation_slide` is the only always-on chiral force. It was
  cleared for **win bias** (`specs/directional-bias.md`) but never for spin
  sign. Minor candidate: the index tiebreak.
- **H4 — ratchet: the engaged re-dress erases rest-shape memory.** Every 2 s
  `reassign_slots` rewrites the lattice from deformed world positions,
  legalizing each increment of rotation and melt; the weave can only restore
  the last 60 ticks. (Also the corner-melt suspect.)
- **H5 — pike lens void: two standoff owners disagree across one frontage.**
  Center pairs: hedge repel at full reach AND enemy bond at `reach_u` — doubly
  held apart. Wing pairs: frontal gate fails → body contact. Straight middle at
  reach + touching ends = the lens. `reach_u` (bond) vs `cur_weapon` (repel) is
  the same one-quantity-two-measurements smell.

## Slice graph

01 (harness) → 02 (metrology) → 03 (attribution) → **reslice [done
2026-07-02]** → 04 (mortal-orbit attribution) → 05 (orbit fix) → 06 (pike
residue) → 07 (silhouette residue) → 08 (re-bless/close), one variable per
slice; slice files carry the contracts. Review map: every shipping slice ends
with the immortal mechanics pins green, the relevant vibe re-filmed
(wasm rebuilt first), tight seam crops judged with `compare-screenshots`
against `assets/before-*`, and an unprimed `screenshot-critique` as the final
visual check. Human checkpoints are non-blocking per feature-slicing (open
shots with preview-shots, ~5 min window, decide on evidence, record, proceed).

## Single-owner invariants (the refactor-clean end state)

- **One owner for "how far apart does an engaged pair fight."** Today the
  enemy bond and the weapon repel both push the same pair (documented debt:
  `specs/standoff-double-push.md`, absorbed by slice 04 — its rider demands one
  owner and a 1v1 reach-settle pin, invariant under `weapon_repel` ∈ {0, 15}).
  The reach source unifies to the weapon in hand.
- **One owner for anti-interleave.** If the fixed hold makes the
  forward-corridor clamp (backlog Tier-1 #1) or the hardcoded 0.65 lean
  (Tier-2 #5) dead scaffolding, the slice that proves it **deletes** them. Net
  sim code goes DOWN if the foundation is real.
- **One rotation reference per unit.** Facing freeze + anchor-follows-men +
  relabel-from-positions currently leaves NO fixed frame an engaged unit
  remembers; whatever ships must leave exactly one authority for "which way is
  this body supposed to point," and the re-dress must not overwrite it.
- No transitional scaffolding without a named removal slice.

## Scope firewalls

- **No balance changes** — no stat/price edits; physics-exposed `balance_*`
  movement goes in the ledger for a separate balance pass. Never a mechanics
  exception to keep a balance verdict.
- **Slot-repair layer sacred** (column-closing invariants): `compact_columns`
  keys on rank + soldier index, never world position; no engaged relabels for
  ordinary repair; wiped-file notch; donors `min(gap, 6)`; no-crab rails
  (p95 < 0.45 m / peak < 0.55 m). The ONLY negotiable item is the
  `engaged_deep_reform` carve-out — renegotiated explicitly with David in
  slice 05 with `column_contact_width_stays_near_its_deployed_footprint` kept
  green, never silently.
- **No `OrderMode` gates** — move == attack is the litmus
  (`attack_latch_behaves_like_a_move_order`, heavy-move-clash vibe).
- **No positional clamps** — a hold is a two-way force in the strong
  (collision) medium, overpowerable by a better-backed foe.
- **The wrap survives.** Envelopment closing to body contact is the point;
  only *mutual symmetric* wrap must stall. `a_wide_line_wraps_a_narrow_block`
  and the mortal backfill pin stay green. Likewise the **hedge is the
  anti-cavalry wall** — any repel change re-checks cav-v-pike gates.
- **gang_cap is not a lever** (its comment forbids new consumers). Renderer
  and `web/` untouched except re-blessing. Cavalry/trample paths untouched;
  containment proven via golden (foot-only changes should move it only through
  foot matchups).
- **Dead ends, do not retry:** rear no-cruise gates, removing the friendly
  slide wholesale, same-file slide damping, pivot *lateral* damping,
  suppressing lateral pressure (all column-closing, most executed by the
  HP4/HP1 survivability rail); bare `weapon_repel` bump (chaotic/non-monotone),
  closing-velocity repel damping (seed-fragile), enemy body padding, bare
  skip-own-target (all falsified in standoff-double-push); a facing servo
  tracking the foe centroid mid-grind (that IS the swirl — see the contact-lock
  comment).

## Known unknowns

| Unknown | Discovered by |
|---|---|
| Is the band casualty-seepage (mortal-only) or equilibrium drift (also immortal)? | 02 immortal/mortal twins |
| Do seam churn and pinwheel share one "never settles" root? | 03 torque + crossing ledgers |
| What seeds the rotation direction (slide chirality? tiebreak? wrap feedback)? | 02 seed sweep + 03 ablations |
| Is the band carrier steering (gating/targeting) or collision residual (solver rebuild)? | 03; decides 04's mechanism |
| Can a bearing-general hold coexist with the wrap? | 04 wrap gates |
| Does any seam hold survive the HP4/HP1 executioner? | 04/05, run early |
| Is the pike void downstream of rotation or its own owner bug? | 03 rotation-suppressed profile |
| How much silhouette heals free from 04–06? | 07 opening measurement |

## Slice 03 verdicts (measured)

| question | verdict | deciding numbers | reproduce |
|---|---|---|---|
| Torque budget | OPEN | Traced mortal heavy (feature-on, 300-400s) did not expose one persistent driver channel. Rotation rose 21.5 -> 61.9 deg over 300-375s, then fell to 37.7 deg by 400s. Net torque is a small residual of huge opposing steering terms: e.g. 350-375s unit 1 `SpeedCap` +100504 vs `PivotSpring` -109276, with `Magnet` +5017, `CorridorClamp` +4001, `SlotPull` +3914. This is a steering/cap feedback, not a clean single-channel torque. | `cargo test -p sim --test force_trace --features force-trace write_slice03_torque_budget -- --ignored --nocapture` |
| Chirality seed | KILLED | `SLIDE=0` did not collapse rotation rate: baseline five-seed mortal rates over 300-400s were +0.2257, +0.1466, -0.0395, -0.1153, +0.1674 deg/s; `slide0` rates were +0.1356, -0.1326, -0.0110, -0.0959, -0.1491 deg/s. `slide0_tiebreak0` matched `slide0` exactly in this sweep. | `cargo test -p sim --test mechanics_melee blob_probe_slice03_chirality_and_ratchet_ablation -- --ignored --nocapture` |
| Ratchet / engaged deep reform | OPEN | Deep reform beats do rewrite lattice orientation: with reform on, late immortal beats jump roughly 10-15 deg; with reform off, before/after deltas stay near 0. But the ablation splits by mortality. Immortal seed 0x4202 plateaus with reform off (`rot300=4.16`, `rot400=0.28`, band p95 0.11r), while mortal five-seed `deepreform0` often blows up (`rot400` ~= 180 deg in 4/5 seeds). Contact-width metric stayed unchanged in this probe (`deployed=6.30m`, min 6.58m, max 12.87m both on/off). | `cargo test -p sim --test mechanics_melee blob_probe_slice03_deep_reform_ratchet -- --ignored --nocapture` and `cargo test -p sim --test mechanics_melee blob_probe_slice03_chirality_and_ratchet_ablation -- --ignored --nocapture` |
| Wrap torque | OPEN | With `SLIDE=0`, disabling flank curl reduced but did not remove mortal residual torque. Mean per-unit total torque over 300-375s fell from ~3996 to ~2717 per 25s window (about 32% reduction), while rates stayed nonzero in the non-traced sweep (`slide0_deepreform1_flankcurl0`: -0.2232, +0.0489, +0.1075, +0.0674, -0.0571 deg/s). Remaining torque is still dominated by `SpeedCap`/`PivotSpring`/`WeaveNet` steering terms. | `SLIDE=0 cargo test -p sim --test force_trace --features force-trace write_slice03_torque_budget -- --ignored --nocapture` and `SLIDE=0 FLANKCURL=0 cargo test -p sim --test force_trace --features force-trace write_slice03_torque_budget -- --ignored --nocapture` |
| Pike void owner | KILLED | The sampled pike bins do not show wing frontal-gate failure. At t=60s and t=200s, nearest-pair `frontal_gate` was `1/1` across sampled bins. At t=200s the mid gap was only slightly larger (`mid=2.66m`, `end=2.53m`, lens +0.13m), and center bins were mostly bond-only/no-repel, not a double-hold center plus failed-gate wings. | `cargo test -p sim --test mechanics_melee blob_probe_slice03_pike_void_owner_bins -- --ignored --nocapture` |
| Band reconciliation | KILLED | Full-noise real HeavySword mortal/morale/default-micro grind did not produce a sustained deep band: settled `band_p95=1.99r` (< 3r). Rotation and silhouette are the visible failures: `rot300=24.63deg`, `rot400=39.72deg`, `rate300_400=0.1509deg/s`, `silhouette_floor=0.62`. | `cargo test -p sim --test mechanics_melee blob_probe_slice03_vibe_like_heavy_grind -- --ignored --nocapture` |

## Slice 04 verdicts (measured)

| mechanism | verdict | deciding numbers | reproduce |
|---|---|---|---|
| Cap-clips-the-spring | CONFIRMED | SpeedCap removes the component parallel to PivotSpring more strongly in mortal runs: avg `parallel_frac_of_signed` 0.933 mortal vs 0.880 immortal, avg `parallel_frac_of_total` 0.775 vs 0.689. In the ramp window 350-375s, mortal unit 1 reached 0.907 parallel-of-total and 0.983 parallel-of-signed while immortal stayed ~0.690/~0.881. Mortality amplifies an existing cap/spring cancellation into sustained residual drift. | `cargo test -p sim --test force_trace --features force-trace blob_probe_slice04_cap_clips_spring -- --ignored --nocapture` |
| Off-axis mass chase | KILLED | Rotation-rate sign followed the foe alive-mass offset sign in only 3/5 seeds. Seeds 0 and 1 rotated positive over 300-400s (`+0.2521`, `+0.1683 deg/s`) while the average foe-mass angle was negative (`-14.317`, `-16.988 deg`). Late kill asymmetry had a signal (4/5 sign matches), but the mass-offset criterion failed. | `cargo test -p sim --test mechanics_melee blob_probe_slice04_off_axis_mass_chase -- --ignored --nocapture` |
| Ratchet timing | KILLED | Re-dress beats cancel/rewrite lattice drift instead of legalizing pair orbit: across 1259 mortal beats, mean abs inter-beat lattice drift was 15.7-17.9 deg and mean abs beat step was 15.6-17.8 deg, while pair rotation between beats was only 1.0-1.6 deg. Beat step exceeded inter-beat drift in 607/1259 beats and matched rotation sign in 700/1259, not a ratchet signature. | `cargo test -p sim --test mechanics_melee blob_probe_slice04_ratchet_timing -- --ignored --nocapture` |
| Forward-close feed | KILLED | Compact-column repair events did not systematically shift alive mass toward the wrap side. Across 137 events, mean signed physical lateral shift was -0.0012 m/event with 79/137 toward-wrap; slot-target shift was -0.0027 m/event with only 22/137 toward-wrap. | `cargo test -p sim --test mechanics_melee blob_probe_slice04_forward_close_feed -- --ignored --nocapture` |

THE named mortal-unlock mechanism is cap-clips-the-spring: mortality amplifies SpeedCap clipping of PivotSpring's restoring steering until the residual pair rotation persists.

## Risks

- **Pins expected to move (deliberate, ledgered, re-pinned from printed
  actuals):** golden (once per shipping slice, same commit); the 0.30/0.40
  interpenetration pins (re-pin *tighter* around corrected physics, never
  looser); attack-latch diffs; wrap-depth counts; backfill late-gap rails;
  long-grind `balance_*` outcomes and the ~3–4-minute lethality pin (re-derive
  with David, never dialed back with an unrelated knob); every melee vibe
  baseline and possibly the column-closing-era penetration/offense shots.
- **Knife-edges:** the survivability ceiling HP4/HP1 ∈ 3.5–6.0×
  (mechanics_survivability.rs — executed five prior anti-blob levers; check it
  FIRST in 04/05, not last); `symmetric_clash_has_no_mechanical_bias` (a
  20-seed band — any chirality fix can move it); the impale reach cliff (the
  1v1 reach pin is the guard); invariant pins (centroid swap, no-blob, facing
  rails) are never widened to ship this.
- **Foundation-rebuild triggers** (any one, with numbers in hand): (a) 02's
  metrics are deaf to every single-force ablation — the engaged-steering
  equilibrium itself never settles; (b) 04 cannot hold both the band bound and
  the survivability rail after a genuine sweep; (c) the standoff double-count
  proves un-removable additively. The rebuild shape: ONE two-way front-membrane
  owner in the collision medium replacing enemy-bond-standoff + weapon repel +
  corridor clamp (deleting what it obsoletes — net code down; the
  standoff-double-push spec's own endpoint: "treat the enemy front rank as a
  line, not a bag of circles"). Protocol per tweak-mechanics: write the FEW new
  isolated foundation pins first, make those perfect, expect the scoreboard to
  invert, contain (foot-only; golden moves only where expected), settle each
  red's provenance, re-derive downstream pins WITH David, commit noting the
  deliberate regressions.
- **Process:** `--no-fail-fast` always, trust exit codes; rebuild wasm before
  every filming; commits scoped to touched files (concurrent sessions are
  real).

## Prior art

- `specs/standoff-double-push.md` — the double-count debt, the measured front
  zipper (−17 m on braced walls), the falsified local knobs, and the rider
  slice 04 executes. Its sim.rs line refs are stale; trust the force-stack
  table above.
- `specs/directional-bias.md` — slide chirality cleared for win bias only;
  "instrument, don't guess — every guess so far was wrong."
- `specs/done/column-closing/README.md` — the crab fix this builds on; its
  invariants are the firewalls above; its dead ends are pre-failed moves.
- `.claude/skills/tweak-mechanics/references/first-principles-backlog.md` —
  the corridor clamp (Tier-1 #1) and 0.65 lean (Tier-2 #5) are candidates this
  feature may retire.
