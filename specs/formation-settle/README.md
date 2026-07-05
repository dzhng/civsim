# Formation settle: kill the never-settling churn

A halted formation must come to rest. Today three measured situations never
do — the sim carries standing limit cycles where a driving force never
reaches zero, so units mill, buzz, or slosh forever. This spec turns the
existing diagnosis into red gates, fixes each family at the force level, and
retires the probe file into pinned mechanics tests.

David's original report (2026-07-05): "after I tell the unit to go to a
place, sometimes once it reaches there, its lines shift left and right and
never settle — 1–2 minutes before it finally settles"; and "the same lateral
shifting during battles."

## The measured families (diagnosis complete)

All numbers from `crates/sim/tests/mechanics_settle_probe.rs` (print-only
probes, `--nocapture`), measured at 3d72b159..973ba374. Idle baseline: a
settled block reads **~0.018 m/s** mean soldier speed (deterministic fidget).

| # | Situation | Sustained state | Owner slice |
|---|---|---|---|
| A | Destination near impassable genmap geometry (seed-1 cliff pocket, margins 10–14m) | 1.7–2.4 m/s, 8–14m excursions, cohesion stuck ~0.08–0.15; margin 10 settles ~90s, margin 14 **never** (180s+) | 02 |
| A′ | Halted squeezed inside a marginal corridor (gap ≈ frontage, files_eff reduced) | 0.10–0.13 m/s buzz forever, cm amplitude | 02 |
| B | Destination frame overlapping a standing friendly block (2/5/10m overlap) | 0.06/0.11/0.21 m/s buzz forever, cm amplitude | 03 |
| C | Immortal 120v120 grind, 10+ min after contact | ~1.1 m/s mean, lateral ~0.63 m/s, 1.8–2.6m excursions, 70–86/120 men, forever | 04 |

**Cleared suspects** (all settle to baseline within one 10s window — do not
re-chase): plain/angled (20–60°)/pivot/frayed arrivals; rough patches, rough
edges, crossed rough strips (roughness only multiplies speed caps, and a cap
cannot move a halted man); adjacent group moves with normal 2m clearance;
spawn-in-place at the family-A pocket (the spot is march-order-dependent).

**Root shape** (force-trace attribution, family A): stragglers split from the
block by wall geometry sit ~60m from their slots; SlotPull + WeaveNet net
force stays nonzero at rest — the "equilibrium failures" signature in
[tweak-mechanics](../../.claude/skills/tweak-mechanics/SKILL.md). The
at-ease reform beat amplifies (re-sorts slots every 45 ticks while cohesion
< 0.9 → ~800 slot changes / 10s) but is NOT the root: disabling it left the
churn at higher speed. Family B is the steer-pass-vs-separation-solver limit
cycle already named in the first-principles backlog (Tier 2, "Limit cycles
damped, not killed") — the reversal-gated idle damp cannot reach it.

## Doctrine (inherited, non-negotiable)

- **Forces, never walls.** The fix is a driving force that goes to zero at
  equilibrium, not a clamp/flag/threshold that hides motion. Every candidate
  fix must name the force it changes and confirm that force ACTS on the
  churning bodies (trace it, don't infer it).
- **A root fix is contained.** The cleared-suspect telemetry above must stay
  at baseline, byte-similar. Golden should hold for slices 02–03 (its maps
  march units on open ground, no wall contact); if golden moves, find the
  leak before re-pinning — a deliberate re-pin needs a one-line cause in the
  same commit.
- Mechanics tests use IMMORTAL fakes, morale off, `micro_rough = 0` unless
  the subject requires otherwise; assert cohesion/speed/settle — never wins.
- One quantity, one measurement: the settle telemetry lives in ONE shared
  test-support module (slice 01), never re-derived per test.
- [debug](../../.claude/skills/debug/SKILL.md) for every red;
  [write-tests](../../.claude/skills/write-tests/SKILL.md) for the harness
  rules; [change-report](../../.claude/skills/change-report/SKILL.md) ledger
  at the end of any pass that moves a test.

## Slice graph

```
01-red-gates ──► 02-wall-split-equilibrium ──► 03-friendly-overlap-cycle ──► 05-close-out
                                    └────────► 04-grind-lateral-slosh ─────────┘
```

02 before 03: the families share the "unreachable target" root shape, and
the family-A fix may collapse part of B — re-run the B gate after 02 lands
before designing 03. 04 is independent of 03 but depends on 01's telemetry
module and benefits from 02's findings.

## Verification gates (standing)

- `cargo test -p sim --no-fail-fast` — trust the exit code, never grep.
- The slice-01 settle gates: red exactly where this spec says, green
  elsewhere. A new red anywhere else is a leak, not progress.
- Golden hash: expected to HOLD through 02–03 (containment signal). Any
  move is investigated first, re-pinned deliberately only with cause.
- Rebuild wasm before any browser confirmation (stale-binary trap).
- Final feel verdict (05): browser session on curated seed-1, move a unit
  into the cliff pocket margin ~14m — visually settles; plus a re-read of
  the standing vibes after re-bless if any moved.

## Non-goals

- No balance retunes; no stat changes. If a fix exposes a balance shift,
  record it for [balance-unit](../../.claude/skills/balance-unit/SKILL.md)
  and keep the physics.
- No renderer work. The flag/camera items from the same report shipped
  separately (b3ab921c, c13e60bb).
- Not a rewrite of the corridor machinery or `gang_cap` (backlog Tier 1
  items) — touch them only where a family's root demonstrably lives there.

## Next Agent Prompt

**Status 2026-07-05 (pass 2): slices 01 + 02a SHIPPED. Next: slice 02b
(frame clearance at walls), then 03.**

Slice 01 (tests-only, codex): settle telemetry owned by
`crates/sim/tests/common/settle.rs`, gates in
`crates/sim/tests/mechanics_settle.rs`. `SETTLE_SPEED = 0.06`, within 20s
(30s for the family gates). Run remaining reds with
`cargo test -p sim --test mechanics_settle -- --ignored`.

Slice 02a (sim source, codex): the wall-split tractor is dead. Weave/pivot
bonds skip when stretched > rest+2m AND the segment crosses impassable
ground (`Terrain::segment_passable`); a slot > 3m away whose straight
segment is blocked stops pulling (the man stands; cohesion honestly reads
him missing). Cliff margins 12/14/18 settle to baseline in one window
(was 1.7 m/s forever); force nets collapsed ~100x (WeaveNet (+49,+385) →
(+0.03,-0.05)). Gate `settle_near_impassable_pocket` [14,18] is live.

RESLICE during pass 2: the old margin sweep bundled two mechanisms.
Margins 10/12 with slots ON impassable/slow cells (measured margin 10:
blocked=2 slow=6) churn EPISODICALLY (quiet stretches + bursts with
cohesion crashes and slot-change spikes ~170/10s) — that is the
frame-level escape-slide/corridor/reform interplay, now the **02b** gate
`settle_with_frame_slots_in_wall` [10,12], ignored alongside
`settle_inside_marginal_corridor`. Corridor ledger evidence (committed
attribution probes): zero separation-solver records, edge files carry
2.3x force, IdleSettleDamp constantly firing — terrain family, not 03.

Pick up at 02b: the design question is what the FRAME does when its
resting slots are unstandable or wall-tight — the halted-frame escape
slide (sim.rs "slides itself clear", 0.45m steps every 15 ticks), the
corridor width machinery, and the at-ease reform each pull it a different
way. Instrument the margin-10 burst cycle first (force-trace + files_eff/
anchor over time through one burst), convict the oscillator, then fix
THAT. Known limitation to preserve, not fix here: a wall-lost straggler
stays lost until re-ordered (acceptable; a new order re-paths the unit).

Carried-in red (NOT ours): `force_trace_smoke_covers_expected_channels`
fails at HEAD (missing CorridorClamp in its open-ground scenario) — the
feature-gated force-trace suite is not in the default run; predates this
spec. The conservation test that matters
(`force_trace_steering_conserves_pre_collision_displacement`) is green
with 02a. Also: `codex review --uncommitted` cannot start its app-server
inside the workspace-write sandbox — review from the orchestrator side.

You are running one pass of
[implement-spec](../../.claude/skills/implement-spec/SKILL.md) on this spec.
Read [tweak-mechanics](../../.claude/skills/tweak-mechanics/SKILL.md) and its
first-principles backlog BEFORE touching sim code — this spec is an
instance of its "equilibrium failures" and "limit cycles" sections, and its
containment/provenance rules are the acceptance bar here.

1. Run `cargo test -p sim --no-fail-fast`. Account for every red: it must be
   either a slice-01 gate that is red by design (listed in the slice file)
   or carried-in at HEAD (prove with `git stash -u` + rerun).
2. Pick the first unchecked TODO below. One coherent pass per run: usually
   one slice, or one measured sub-step of 02 (it is the deep one).
3. Follow the slice file. Trace before theorizing: the force-trace harness
   (`--features force-trace`) is the ledger; the probe file's helpers
   (`window_motion`, `audit_slots`, the ASCII map) are your instruments
   until slice 01 promotes them.
4. Before committing: `cargo fmt`, full `--no-fail-fast` run,
   [refactor-clean](../../.claude/skills/refactor-clean/SKILL.md), then a
   review pass. Ship a [change-report](../../.claude/skills/change-report/SKILL.md)
   ledger in the pass summary if any test moved.
5. Update THIS section before ending your pass: status date, what landed,
   next pickup point, any new trap you hit. Reslice instead of broadening a
   patch — if a fix wants to touch a second family, stop and update the spec.

Human checkpoints are **non-blocking**: state the decision + options in the
pass summary, wait ~5 minutes, then decide on the evidence, record the
rationale here, and continue. Never idle waiting for sign-off.

### Global TODO

- [x] 01 — Red gates: promote settle telemetry into `tests/common`, pin the
      cleared suspects green, pin families A/A′/B/C as gates (red today) →
      [slices/01-red-gates.md](slices/01-red-gates.md)
- [x] 02a — Wall-split tractor: bonds/slot-pull zero across impassable
      ground → [slices/02-wall-split-equilibrium.md](slices/02-wall-split-equilibrium.md)
- [ ] 02b — Frame clearance at walls: the escape-slide/corridor/reform
      oscillator when resting slots are unstandable or wall-tight (gates
      `settle_with_frame_slots_in_wall` + `settle_inside_marginal_corridor`)
      → [slices/02-wall-split-equilibrium.md](slices/02-wall-split-equilibrium.md)
- [ ] 03 — Family B root fix: steer-vs-separation cycle on friendly overlap
      → [slices/03-friendly-overlap-cycle.md](slices/03-friendly-overlap-cycle.md)
- [ ] 04 — Family C: attribute and bound the sustained grind lateral slosh
      → [slices/04-grind-lateral-slosh.md](slices/04-grind-lateral-slosh.md)
- [ ] 05 — Close-out: retire the probe file, browser feel-check, vibe
      re-bless if needed, ledger, then
      [close-spec](../../.claude/skills/close-spec/SKILL.md) →
      [slices/05-close-out.md](slices/05-close-out.md)

## Provenance

Diagnosis ran in the 2026-07-05 session that shipped the probe file
(973ba374): repro sweep (straight/angled/pivot/frayed/rough/corridor/
genmap/overlap/grind), force-trace attribution, and the at-ease-reform
disable experiment. The write-spec three-draft fan-out was deliberately
skipped: the slice cut maps 1:1 onto independently measured failure
families, and the diagnosis session already did the recon a blind draft
would redo. The genuine open design question — which force closes each
family — is exactly what slices 02–04 are shaped to answer one at a time.
