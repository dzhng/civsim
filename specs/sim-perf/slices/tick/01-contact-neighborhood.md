# tick/01 — Reuse immutable contact metadata

## Shipped contract

Projection reuses the body owners and radii established by the initial body
build. Alive state, mounted state, facing and radius cannot change during those
Jacobi passes; impact casualties apply afterward. Only body positions are
rebuilt each pass. Immutable slice borrows express this boundary and remove
redundant metadata writes without adding retained state.

The timing and snapshot boundaries stay unchanged: weapon-repel uses bodies
before wall correction, projection rebuilds positions at each pass's start,
and targeting reads the final rebuilt body snapshot with its final soldier
query position. Rebuilding bodies immediately before targeting would change
behavior and is not part of this optimization.

## Shared-neighborhood verdict

The planned shared neighborhood was **rejected after measured trials, not
delivered**. A retained bucket-membership layout and a direct-mapped query cache
both preserved state hashes, but the bounded interleaved comparison did not
establish a robust developed-combat gain under the observed host variance.
Both were removed; no future pickup or hidden compatibility mode remains.
[Evidence and all trial results](../../assets/tick01-native-2026-09-09.md)
record the decision and its limits.

Targeting and projection retain their existing first-occurrence hash-bucket
walk and owner handling. Weapon-repel remains independent: its dynamically
sized window and non-deduplicating bucket walk are a different traversal
contract. Mounted bodies, first candidate ties and strike-owner dedup retain
their original semantics. No consumer order was changed to force sharing.

## Verification

The final change reproduces the golden state hash, all-class duel combined
hash and seed-7 AI run through 9,000 ticks. Default checking, formatting and
independent review pass; no test was re-pinned. The integrating agent runs the full workspace, mechanics,
scenario and balance suites and the rebuilt-wasm vibe, then profiles the final
combined change and evaluates the standing budget gate. Trial measurements
alone do not claim those integrated gates passed.
