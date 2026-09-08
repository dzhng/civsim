# Choices ledger

Decisions made where the plan was silent. Banked choices are settled for
subsequent passes; the final audit reconciles them with the shipped state.

## Sound

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
Both must meet 25 ms per tick, and the later window must finish with at least
30,000 living soldiers. Otherwise, a fast opening skirmish—or a cheap late
battle after most men have died—could be mistaken for success at 30k scale.
**Gap:** The spec defined when first contact occurs but did not establish that
this short opening window represented developed combat.
**Reach:** Future optimizations retain the original coverage and must also
handle a busy front at the intended population. The benchmark can explicitly
select a later window; it does not change when any game event happens.
**Verdict:** Sound: strengthens the evidence for the existing budget without
changing simulation behavior or lowering a threshold. **Confidence:** high.
