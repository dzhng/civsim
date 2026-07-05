# S4 — Campaign guardrail: islands stay neutral, army-less, inert

Pin goal #2 so a future change cannot accidentally arm, road, or re-persona a true
island. This is a lock-in test over already-correct state — no behavior change.

## Contract
Every city not in the main component `M` (i.e. a true island holding) must:
(a) be owned by a **non-playable** faction, (b) have `ai_persona == Neutral` ⇒
`campaigns() == false` (garrisons, never marches), (c) appear in **no**
`start_armies` entry.

## API seam
A `cargo test -p campaign` test over the loaded `WorldMap` (reuses `mapdata.rs`
parsing). Recompute `M` (or consume the island roster `connectivity` emits) and
assert the three properties per island city. Owner: `crates/campaign` test;
`connectivity`'s roster is the input of truth.

## Human runs / sees
`cargo test -p campaign`; islands render muted with no phantom roads (unchanged
from pre-feature).

## Verification
- New `cargo test -p campaign` assertion green; `cargo test -p mapgen` green.
- **[find-map-bugs](../../../.claude/skills/find-map-bugs/SKILL.md)** regional
  crops of Britain / Cyprus / Sardinia / Balearics: muted neutral fills, zero
  mainland roads.

## Human review checkpoint (non-blocking)
Confirm the island render is unchanged from the pre-feature look (the spec forbids
a visual change to islands). Open the island crops with
[preview-shots](../../../.claude/skills/preview-shots/SKILL.md); decide on the
evidence if silent.

## What must stay green
`cargo test -p mapgen`; the S3 honest invariant.

## What would change this slice
David later wants islands visually distinct after all ("frontier" look / flavor
factions) → that becomes a new visual slice; this guardrail only pins the
functional state (neutral/army-less/inert), not the color.

## Firewalls inherited
Battle untouched; determinism; **no visual change to islands**.
