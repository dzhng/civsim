# Live gait consumer

The existing live gait gate must read the same manifest and physical observation
as the renderer. It now resolves the selected class's appearance manifests through
the default catalog and measures phase against cumulative engine motor-path delta
divided by authored stride. Literal placeholder clip names and a one-cycle-per-
duration assumption are not valid production contracts.

The small read-only debug getter uses the existing fresh WASM view owner; it adds
no simulation writes, animation state or authoritative timing. This gate explicitly
freezes the clock and samples each engine tick, so both counter and submitted phase
refer to the current completed endpoint. It does not compare a latest engine
counter with delayed fractional live presentation.

Coverage remains eight soldiers across every tick of the original 90-tick window,
with the existing three-tick screenshot-motion window and bounded pre-roll. A
stable appearance is now checked as well as its declared walk clip. The old
wall-time period/flat-step assertions are replaced by per-step physical-distance
agreement: zero measured travel may hold a phase; positive travel must accumulate
the correct cycles. This is stronger about motion ownership and does not assert
visual foot planting from a counter.

The new variable-speed/wrap test fails the old duration-based metrics; perturbing
one phase fails the physical comparison. A second test accepts a genuinely named
walk clip and rejects a changed appearance or placeholder-name substitution.
Independent review confirmed endpoint alignment and found the new Node tests were
outside the standard Vitest include. Both the gait and card/capture tests are now
Vitest suites in the configured test tree. The focused gait/capture/view tests and
typecheck pass. GPU execution remains an integration obligation, not a claimed
result of these CPU checks.
