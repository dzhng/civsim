# Sim tick at 30k — fit the fighting tick in the frame

Make a **30,000-soldier engaged battle simulate at ≤ 25 ms/tick** (today: ~50 ms
fighting, ~24.5 ms idle — measured, see [investigation.md](investigation.md)),
so 30k live battles fit a 30 fps frame alongside the renderer (~3 ms GPU). The
renderer side is done (`specs/3d-perspective-renderer/` 04f gate); the sim tick
is the blocker. This is SIM-domain work: [tweak-mechanics](../../.claude/skills/tweak-mechanics/SKILL.md),
[write-tests](../../.claude/skills/write-tests/SKILL.md), [debug](../../.claude/skills/debug/SKILL.md),
and [write-vibe](../../.claude/skills/write-vibe/SKILL.md) govern how changes are
made and judged; the renderer spec's firewalls do not apply here (this spec DOES
touch `crates/sim`), but the combat design contract memory and the seed-stable
test suite are sacred.

## Next Agent Prompt

**Status:** Spec authored 2026-07-02 from the codex investigation
([investigation.md](investigation.md) — measured hotspot tables, scaling curve,
ranked recommendations) + David's interview (locked decisions below). The usual
three-draft fan-out was deliberately skipped: the investigation IS the recon and
ranking, verified green (`cargo test --workspace`, sim suite) with the
instrumentation patch applied. **Nothing implemented yet. Start at slice `00`.**

**Exact pickup point:** slice `00` — apply
[`assets/perf-instrumentation.patch`](assets/perf-instrumentation.patch) (the
codex bench harness + feature-gated stage profiler, verified to apply clean and
pass the full workspace suite), then build the two oracles every later slice
needs: the **state-hash golden harness** and the **standing tick-budget gate**.
Do NOT start an optimization slice before `00`'s oracles exist.

**Locked decisions (David, 2026-07-02 interview — do not re-litigate):**
- **Budget: ≤ 25 ms/tick at 30k fighting** (hard gate; ~2× reduction). Bare
  30 fps fit — if a slice can cheaply exceed the target, take the headroom.
- **60k is measured, not gated:** track the 60k number + the superlinearity
  trend every slice; no hard budget. The 60k projection spike (investigation
  rec #3) is DEFERRED unless the trend worsens.
- **Everything is on the table** — all seven investigation recommendations,
  including behavior-adjacent ones (sleeping, tick-rate decoupling) and
  parallelism. But sequenced pure-perf-first: behavior-adjacent work only
  starts if the budget isn't met purely, or as headroom afterwards.

**The determinism contract (every slice's oracle):** the sim is deterministic
and seed-stable; the test suite encodes it. A pure-perf slice must produce
**bit-identical state hashes** over N ticks across a seed set, before vs after
(slice `00` builds the harness). A slice that cannot keep hash-identity is BY
DEFINITION behavior-adjacent and moves to the behavior track (vibe-gated as a
designed mechanics change per tweak-mechanics — never a silent perf tweak).

**Global TODO (each → owning slice):**
- [ ] `00` — land instrumentation patch + state-hash golden harness + standing
      ≤25 ms tick gate (`slices/00-harness-and-oracles.md`)
- [ ] `01` — proximity-gate `collision.weapon_repel` (rec #1; ~15 ms idle,
      big fighting slice) (`slices/01-gate-weapon-repel.md`)
- [ ] `02` — shared per-tick contact neighborhood (rec #2; the big fighting
      win, highest ordering risk) (`slices/02-shared-contact-neighborhood.md`)
- [ ] `03` — scratch-buffer reuse (rec #5; low risk) (`slices/03-scratch-buffers.md`)
- [ ] `04` — CHECKPOINT: measure. If ≤25 ms fighting at 30k → remaining slices
      become optional headroom; record and decide with David
      (`slices/04-budget-checkpoint.md`)
- [ ] `05` — deterministic sleeping for settled idle units (rec #4; DESIGNED
      mechanics change, vibe-gated) (`slices/05-idle-sleeping.md`)
- [ ] `06` — deterministic parallelism (rec #6; fixed-chunk partition, stable
      merge; hardest determinism risk, LAST among perf levers)
      (`slices/06-parallelism.md`)
- [ ] `07` — tick-rate/frame decoupling (rec #7; product fallback, David
      checkpoint) (`slices/07-tick-decoupling.md`)
- [ ] close-spec when the gate is green and David accepts the ladder state

**Instruction to the next agent:** update this section before ending your pass.

## Standing gates (every slice)

- **State-hash golden** (pure-perf slices): bit-identical over ≥600 ticks ×
  ≥3 seeds × idle+fighting fixtures, before vs after. Behavior-track slices
  (05/07) instead re-pin deliberately with vibe + full-suite evidence.
- **Tick-budget gate:** 30k fighting ≤ 25 ms (release, native, this Mac),
  via the slice-00 gate command; 60k measured + trend recorded in the ledger
  below. Bench methodology per the investigation (300 ticks, 60 warmup,
  2 repeats; variance noted).
- `cargo test --workspace` green; the balance/mechanics/scenario suites are
  the behavior oracle (memory: turn-rate couples balance — full suite after
  any mechanics-adjacent change).
- Instrumentation stays feature-gated (`perf_timing`) — zero default-build
  cost; `cargo check -p sim` (no features) must stay clean.

## Frame-time ledger (fighting, 30.6k / 60.2k actual soldiers)

| after | 30k ms/tick | 60k ms/tick | notes |
|---|---|---|---|
| baseline (investigation) | 49.4–50.3 | 136–138 | idle: 24.5 / 57.3 |

## Slice graph

```
00 harness + oracles (patch, state-hash golden, budget gate)
      │
01 gate weapon_repel (pure-perf) ──▶ 02 shared contact neighborhood (pure-perf)
      │                                     │
      └────────────▶ 03 scratch buffers ────┘
                            │
                     04 BUDGET CHECKPOINT (≤25ms? → rest is headroom)
                            │
        05 idle sleeping (behavior track, vibe-gated)
        06 parallelism (last perf lever; determinism-hardest)
        07 tick-rate decoupling (product fallback; David checkpoint)
```

Ordering rationale: `01` is the cheapest big win and its active-set logic feeds
`02`'s neighborhood thinking; `02` is where most of the fighting budget lives;
parallelism is LAST because parallelizing duplicated work wastes the win and
maximizes determinism risk (investigation rec #6).

## Firewalls

- **Determinism/tests:** never weaken a seed-stable test to pass a perf slice;
  a red balance/scenario test after a "pure" optimization means the
  optimization changed behavior — fix it or move it to the behavior track
  (memory: a first-principles fix that breaks a test may have exposed the
  test — verify the mechanism, not the score).
- **Combat design contract** (memory `battle-sim-combat-design`): push,
  block/evade, crush, facing, depth invariant — perf work must not bend
  mechanics to get speed.
- **Renderer untouched:** this spec is `crates/**` (+ bench/report files);
  the photoreal ladder owns `web/`/`packages/`.
- The quick-battle 1700 m spread cap makes density grow with soldier count
  (investigation): keep fixtures pinned to the game's real spawn shapes so
  the gate measures the product, not a synthetic sparse field.
