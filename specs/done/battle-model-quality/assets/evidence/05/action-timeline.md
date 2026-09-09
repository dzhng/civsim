# Observed action history and bounded transition sources

This is controller evidence, not production replay or GPU blending acceptance.
The [source applicability](catalog-presentation.md) and [shared local sampler](local-pose.md)
remain separate owners.05c still owes the actual battle adaptation and workbench
replay;06 owns GPU pose equivalence.

The controller observes simulation ticks and samples presentation between them.
Repeated observations at one tick cannot create events. Reinforcements append
history; explicit reset, backwards time and a smaller replacement population
start fresh. A failed batch commits neither partial histories nor a reset.
Equipment changes preserve injury history but cannot blend incompatible bundles.
Death freezes the observed appearance and holds its final authored sample.

Non-death policy is full-body injury before observed release before unpaired
melee effort before measured locomotion/rest. A started melee effort finishes
after engagement ends; continued engagement starts another complete effort, not
a global-clock fragment. Applicable mounted efforts override only the declared
rider joints while the base gait continues. Release phase includes the observed
emission age after its authored marker. A release hidden by a higher-priority
reaction is not queued as a later fictitious firing event.

Transitions use150ms of simulation time. Before interruption, the shared sampler
evaluates the old local pose. One immutable source snapshot per active lane holds
that exact result; no endpoint substitution or growing blend expression survives.
Full-body hit/death freezes the complete mounted pose; overlay exit converges to
the currently evaluated base. Completed transitions release controller ownership.
The numeric payload is double precision (80bytes/joint/source), with frozen
ordinary arrays so consumers cannot mutate or detach it. Object/array overhead,
conversion temporaries and GPU packing remain measured costs for07; the payload
counter does not claim total heap allocation.

## Focused checks and review

`bun run --cwd web test tests/actionTimeline.test.ts tests/actionTimelineMounted.test.ts`
passes22 tests. The full merged web suite passes244 tests in49 files. Typecheck
and the full registered bake suite, including `local-pose.test.mjs`, pass.
The production caller cutover must rerun its affected gates after integration.

The main tracer tests each failed before their corresponding behavior existed.
Endpoint substitution reproduced a local translation jump from0.2453703704 to
0.025 at interruption. Later review reproduced mutation of a retained snapshot,
a partial terminal death after a rejected batch, and late firing starting at the
marker rather than its observed age. Each now has a red-to-green regression.

Independent mounted tests use a horse/pelvis/upper hierarchy with distinct
translations, rotations and asymmetric posed triangles. They check entry during
a base crossfade, release restarts on both sides of the transition midpoint,
exit toward a moving base blend, full-body hit/death and paused retained samples.
Replacing the composed source with the base alone fails; replacing overlay exit
with the base destination clip fails. Mutations were restored before acceptance.

The independent controller follow-up found no remaining concrete defect or
actionable test gap and reran all22 focused tests plus typecheck. Its initial four
findings are resolved: emission-age offset, immutable public snapshots, atomic
rejected batches and exact mounted continuity coverage. No finding was dismissed.

## Changed-test ledger

| Tests | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `actionTimeline.test.ts` | No per-soldier event-history or interrupted-pose contract. | Sixteen tests pin entry/duration, terminal death, actual injury, pause/growth/reset, repeated effort, release age, sampling, equipment changes, priority, exact interruptions, bounded immutable storage and rejected-batch rollback. | Replace global action-clock assumptions with observed history. **moved** |
| `actionTimelineMounted.test.ts` | No proof of exact composed-pose continuity during mounted transitions. | Six tests compare local transforms and posed asymmetric triangles across rider entry/restart/exit, full-body hit/death and pause. | Clip-name assertions cannot detect pose snapping. **moved** |

No simulation formula, balance threshold or screenshot baseline changes in this
controller pass. Existing global-frame tests remain until05c removes their old
callers atomically; their replacement ledger belongs to that cutover.
