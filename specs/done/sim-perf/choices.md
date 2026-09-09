# Final choices ledger

Decisions retained in the shipped code and measurement contract.
The user's 35 ms acceptance and simple-changes limit supersede the earlier
optimization ladder. Discarded steering and projection prototypes create no
ongoing implementation obligations.

## Sound — least confident first

### budget the median of complete-window means

**When:** tick/00.
**Choice:** Each fresh battle supplies the average cost of its 300 measured ticks; the gate takes the median of the two averages. For example, an occasional expensive targeting tick still contributes to the cost of keeping that battle running. Taking the median of all individual ticks instead could discard those expensive ticks and pass a battle that cannot sustain the requested rate.
**Gap:** The spec named two repeats and a median ms/tick, but did not say whether the median applied to individual ticks or repeat averages.
**Reach:** Later optimizations must improve the whole measured window. Per-window tick standard deviation separately shows whether the work became more uneven.
**Verdict:** Sound: retains the cost of intermittent expensive work while comparing equal-length repeats. **Confidence:** medium.

### define contact from living combatants and print its extent

**When:** tick/00.
**Choice:** Preparation ends when at least one living soldier is marked fighting by the sim. The requested warm-up follows, and every measured tick must still contain living fighting soldiers. A soldier's fighting flag can remain set after death, so dead soldiers cannot satisfy this check. The gate prints the smallest living fighting count, the living army size and the measured tick interval. A 30k army with a small skirmish therefore remains visibly a small skirmish; the harness does not claim that every soldier is fighting.
**Gap:** The spec said to wait for contact but did not define how to observe it or how much of each army must engage.
**Reach:** This preserves the requested first-contact window without silently imposing a new battle-density target. The developed-fight check separately covers the busier phase before any broad budget conclusion.
**Verdict:** Sound within the literal first-contact fixture; broad fighting-budget conclusions also require the separately recorded developed-fight check. **Confidence:** medium.

### Resolve tick/01 without shipping the proposed shared neighborhood

- **When:** tick/01 contact-data pass.
- **The choice:** When repeated timings of the unchanged battle varied more than the apparent optimization gain, we removed both experimental caches and closed their trial instead of retaining extra state on the strength of an early-combat result. A cache is remembered search work: one prototype remembered each body's grid bucket, and the other remembered neighboring buckets for repeated searches. The final code remembers neither. It only keeps using the existing body-owner and radius arrays while the wall solver adjusts positions; those identities and sizes cannot change during the adjustment passes. The alternative would have shipped new remembered data whose maintenance cost was certain while its benefit in developed combat remained uncertain.
- **The gap:** The plan called for a shared neighborhood and allowed preserving consumers with different ordering, but did not specify how to resolve an exact-state prototype whose developed-combat benefit could not be distinguished from host variation. It also did not identify immutable owner/radius reuse as the replacement scope.
- **The reach:** Targeting, weapon-repel and projection keep their existing candidate traversal contracts. Future search optimization must establish its own benefit; there is no dormant cache, optional mode or deferred implementation hidden behind this slice's completion. This closes a rejected experiment, not a claim that the originally proposed mechanism shipped.
- **Verdict:** Sound. The change removes redundant writes using a proven immutable boundary and avoids adding state without demonstrated benefit. It does not weaken the budget or reinterpret a timing problem as a mechanics problem.
- **Confidence:** Medium. A user could reasonably choose to retain the promising early-window grid result, but developed combat is the governing problem and did not support that commitment reliably.

### Retain the measurement vector as well as precomputations

**When:** tick/02.
**Choice:** Steering returns one set of per-unit measurements for the rest of the tick to consume. Once those consumers finish, the tick returns that vector to `Sim` for reuse. For example, a battle with the same units on the next tick can overwrite the existing measurement storage instead of allocating a new container and dropping the old one thirty times a second. The alternative was to leave this small allocation in place while reusing only the larger precomputation vectors.
**Gap:** The slice explicitly named `UnitPre` and its nested allocations, but did not separately name the returned measurement vector.
**Reach:** The tick remains the sole caller responsible for returning the vector after its last consumer. No measurement value is carried forward as a simulation input; only capacity survives.
**Verdict:** Sound: a small extension of the same storage lifetime with one existing caller and no new adapter. Its individual timing gain is not claimed separately. **Confidence:** medium.

### Stop the worker branch when the harness cannot meet its final frame target

**When:** worker feasibility decision, after the revised load threshold.
**Choice:** An empty browser page delivers a frame every 16.7 ms on this
harness. The final worker contract rejects a median above 14 ms. We therefore
stop before building the read seam and worker cutover, retaining only the
hash export. For example, moving every simulation calculation off the main
thread still cannot make this empty-page clock deliver frames at the required
rate. The alternative was to build the entire seam despite already knowing
that its final acceptance test could not pass without a separate change.
**Gap:** The plan specified staged worker kill thresholds but did not cover
a final frame requirement below the measured cadence of the harness itself.
**Reach:** No transport, asynchronous command surface or worker lifecycle
becomes production debt. Reopening requires an explicit frame-target or
harness decision. The transport probe also needs a corrected snapshot-age
measurement; its negative ages were not treated as valid latency evidence.
**Verdict:** Sound: preserves the specified final requirements and avoids
building a branch that cannot satisfy them. This is an early planning no-go,
not a claim that the full worker/00 or worker/04 gates ran and failed.
**Confidence:** medium; changing the frame contract could make the measured
30 Hz worker worthwhile, but only the load threshold was revised by David.

### Keep native threading optional and benchmark eight workers

**When:** retained weapon-repel integration.
**Choice:** Native callers explicitly enable `parallel`; ordinary and browser
builds remain serial. The performance command enables the feature and sets
eight workers, matching the accepted measurement. For example, running the
benchmark does not imply that the browser gained threads or a new toolchain.
Rayon owns its normal reusable global pool; no pool manager is added.
**Gap:** The plan named Rayon but did not specify its final build or benchmark
configuration. Unconfigured Rayon would use this machine's 18 logical CPUs,
which is a different configuration from the accepted measurement.
**Reach:** The optional native feature, dependency and result vector are the
retained maintenance surfaces. Browser performance remains a separate result.
**Verdict:** Sound: makes the measured configuration explicit and avoids new
runtime machinery. **Confidence:** medium.

### Batch enough search work to avoid scheduling overhead

**When:** weapon-repel scheduling revision.
**Choice:** Rayon does not split search chunks below 1024 bodies; smaller
battles stay in one chunk. A small duel consequently stays together; a large
army offers multiple substantial tasks. Both call the same search code and
apply the resulting forces in the original serial order. The alternative
split tiny tasks whose scheduling cost exceeded their useful work.
**Gap:** The plan did not select task size.
**Reach:** This is a performance choice, not a physics cutoff. Retain it until
a real workload shows a problem; no automatic tuning is introduced.
**Verdict:** Sound: resolves observed small-battle overhead with one library
setting. **Confidence:** medium.

### fail a fixture that never reaches contact

**When:** tick/00.
**Choice:** If a generated battle has still not produced living melee contact after 18,000 ticks, preparation fails. For example, an AI regression that makes both armies stop advancing produces a failed fixture rather than an indefinitely running command or a cheap idle budget result.
**Gap:** The spec required waiting until contact but supplied no termination rule if contact never arrives. Its known approach reached combat before 9,000 ticks; the chosen limit allows twice that time.
**Reach:** Later timing runs cannot silently measure idle preparation as combat, and a broken fixture has bounded work.
**Verdict:** Sound: the limit rejects failure without changing any battle state or the locked timing budget. **Confidence:** high.

### Check developed combat while the army still contains 30k living men

**When:** developed-window acceptance pass.
**Choice:** The budget now checks two phases of the same battle. The first
begins after initial contact, as planned. The second waits until at least
tick 1500, when thousands of men are fighting and over 30,000 remain alive.
Both must meet the current 35 ms budget (revised by David on 2026-09-09), and the later window must finish with at least
30,000 living soldiers. Otherwise, a fast opening skirmish—or a cheap late
battle after most men have died—could be mistaken for success at 30k scale.
**Gap:** The spec defined when first contact occurs but did not establish that
this short opening window represented developed combat.
**Reach:** Future optimizations retain the original coverage and must also
handle a busy front at the intended population. The benchmark can explicitly
select a later window; it does not change when any game event happens.
**Verdict:** Sound: strengthens the evidence for the existing budget without
changing simulation behavior or lowering a threshold. **Confidence:** high.

### Characterize contact in the commanders-off sweep

**When:** tick/03 measurement preparation.
**Choice:** The large-army idle diagnostic disables both commanders but keeps
the same deployment grid as the fighting diagnostic. It runs two fresh
600-tick battles and prints the greatest number of living fighters observed.
For example, if the largest grid places opposing soldiers close enough to
fight without orders, the report exposes that contact; disabling AI alone
does not prove that the measured soldiers were idle. The alternative was to
move the armies or suppress combat just to make the label true, which would
measure a different deployment or different physics.
**Gap:** The checkpoint requested an idle sweep at every size, but the old
idle command only supported the generated 15.5k army and did not define
larger idle deployments. The repeat length retains that original oracle;
the shared grid avoids a second placement recipe.
**Reach:** Future comparisons use identical fixture and harness versions,
and interpret commanders-off timings alongside their observed contact.
The contact count is collected outside the tick timer.
**Verdict:** Sound: makes the workload visible without changing simulation
rules to obtain a favorable timing. **Confidence:** high.

### Skip duplicate lookup for a soldier represented by one body

**When:** tick/01b.
**Choice:** When recording a nearby foot soldier, append it without searching
for an earlier record of the same owner. The grid visits each bucket once,
and that soldier contributes one body, so an earlier copy cannot exist.
A mounted soldier contributes multiple bodies and still uses the original
lookup and replacement rules. The alternative was to search the growing
friend list even when the data producer guarantees uniqueness.
**Gap:** The contact slice did not identify this exact reduction; the
operation count exposed repeated duplicate searches after the cache trials.
**Reach:** The shortcut depends on single-body ownership and unique bucket
visits. Future body representations must preserve that distinction.
**Verdict:** Sound: removes impossible-case work without remembered state
or a different friend order. **Confidence:** high.

### Buffer only search results and preserve serial force arithmetic

**When:** weapon-repel integration.
**Choice:** Each body owns one reusable slot containing its chosen neighbor
and penetration. Searches may finish in any order; forces are then calculated
and added in body order. Two soldiers pushing the same opponent therefore
keep precisely the original floating-point operations. The alternative of
summing worker-local forces would change rounding order.
**Gap:** The plan did not specify how much work to stage.
**Reach:** One result vector is retained; no new physics state or RNG stream
exists. Serial and parallel searches share one closure in their existing owner.
**Verdict:** Sound: minimal staged data with one formula owner.
**Confidence:** high.

### Stop when geometry proves every search empty

**When:** weapon-repel scheduling revision.
**Choice:** If the existing unit extents show no possible enemy search, return
before scheduling bodies or writing empty results. All those searches would
return no neighbor, so force and activation outputs remain unchanged.
**Gap:** The experiment exposed overhead despite the existing per-body skip.
**Reach:** Reuses the geometric guarantee; adds no distance threshold or mode.
**Verdict:** Sound: removes work with no possible effect. **Confidence:** high.
