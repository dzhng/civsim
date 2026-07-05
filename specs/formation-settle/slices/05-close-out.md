# Slice 05 — Close-out: retire the probes, prove the feel

## Contract unlocked

The spec's evidence is permanent and the scaffolding is gone: every settle
contract lives in `mechanics_settle.rs` (no `#[ignore]` left), the probe
file is deleted or reduced to the diagnostic helpers 02–04 still cite, and
the original report is confirmed fixed in the real game.

## Steps

1. **Retire `mechanics_settle_probe.rs`.** Anything a gate now owns is
   deleted from the probe file; `audit_slots`/ASCII-map style diagnostics
   that earned their keep move next to the force-trace helpers in
   `tests/common` (one owner, no duplicate telemetry). A probe that no gate
   or helper replaced gets a reason or gets deleted.
2. **Browser feel-check (the original report).** Rebuild wasm FIRST. On
   curated seed-1 (Shore & Crags): order a unit at a 30–40° angle to a spot
   near the west cliff pocket; order another to overlap a standing friendly.
   Both must visibly settle within ~15s. This is a motion check — watch it
   live or capture a short frame series; a single still cannot show
   "settled."
3. **Vibe re-bless audit.** If 04 moved grind behavior, re-read and re-bless
   the affected vibes per write-vibe; list every re-blessed baseline here
   with its cause.
4. **Ledger.** Produce the final change-report across the whole spec: every
   test that moved, previous → new behavior, why. Paste it into the pass
   summary and link it from the README.
5. **Memory + backlog.** Update the auto-memory `formation-settle-churn`
   note to point at the shipped fixes; strike the resolved Tier-2 item from
   the tweak-mechanics first-principles backlog (or amend it with what
   remains).
6. **Archive.** Run [close-spec](../../../.claude/skills/close-spec/SKILL.md):
   move this spec to `specs/done/` rewritten as rationale (why the forces
   now zero at equilibrium; the invariants that keep it true).

## Verification

- `cargo test -p sim --no-fail-fast` fully green, zero `#[ignore]` in
  `mechanics_settle.rs`.
- `rg mechanics_settle_probe` returns nothing (file retired) or only the
  deliberately-kept diagnostic module with its rationale comment.
- The browser check observed and described (what was ordered, what
  settled, how fast) in the pass summary.

## Human feedback that would change this slice

None expected — this is the janitorial slice. If the browser check FAILS
while all gates are green, that is a missing family: do not close; add the
new repro as a slice-01-style gate and a new slice, and say so in the
README's Next Agent Prompt.
