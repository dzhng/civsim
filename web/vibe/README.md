# Vibe checks

A vibe scenario boots a battle and **films a timeline** — a frame every few
sim-seconds, from the approach through contact, the grind, and the break — so you
can flip through and judge whether a fight *looks* like a fight. The sim is
emergent: simple physics produce the behavior, and whether that behavior is
*realistic* is a question only the eye answers (the root README's "visual tests
are ground truth" rule). This is where that judgement happens for melee.

Every frame is **also a committed pixel baseline** — the same image is the thing
you eyeball, the PR diff, and a gate that turns red when a downstream mechanics
change moves the battle. There is no review-only tier. Frames run through the
shared `snapCheck` primitive, so the regen / re-bless discipline and its gotchas
are the cross-harness ones documented once in
[`../shots/README.md`](../shots/README.md); the **screenshot-regression** skill
is the workflow.

## What's here

- **Scenarios** — small scripts, each driving one matchup (two-unit duels,
  charges, penetration, surround, …). The authoritative list and the parameters
  that define each one live in the `SCENARIOS` table in `all.mjs`; matchups are
  parameterised by class id, and those ids come from the sim's class registry —
  read it there, not from a list here.
- **Shared plumbing** (`_lib.mjs`) — the behavior-neutral helpers every scenario
  reuses: booting a battle to its debug bridge, the screenshot-then-regression
  capture loop, and the common two-unit duel framing. Anything that encodes what
  a *specific* scenario means stays in that scenario's script, never here.

Run the whole sweep with `node vibe/all.mjs` (from `web/`, dev server up), or a
single scenario script on its own to iterate; all honor `UPDATE_SHOTS=1` to
re-bless. A full sweep clears each scenario folder before writing, so stale tail
frames from an older timeline cannot survive. Use `--list` / read `all.mjs` for
what exists rather than trusting this file.

Static model sheets and single-model animation reviews live under
`web/shots/models/scripts/`; they are model-shot generators, not vibe matchups.

> **Weave shots are separate.** The WEAVE lattice has its own Rust picture
> generator (`cargo run -p sim --bin weave_shots --features shots` → `shots/weave/`),
> deliberately kept out of this browser harness — it strips a clash to the bone
> (single units, same-team presses, invulnerable clashes) to isolate the
> lattice. Keep it out of the combat scenarios here; details in
> [`../shots/README.md`](../shots/README.md).
