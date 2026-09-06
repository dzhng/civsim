# Exact frozen-pose reuse — CPU evidence

This is a controller optimization, not acceptance of the animated renderer budget.
The [controller](../../../../../packages/crowd-runtime/src/actionTimeline.ts) still
evaluates every distinct pose with the original interpolation arithmetic. Only
exact repeated capture inputs can share the deeply immutable result.

## Reproduction and result

From the repository root, with web dependencies installed:

```sh
./web/node_modules/.bin/vitest run --config specs/battle-model-quality/assets/evidence/07/frozen-capture-profile.config.ts
```

The opt-in [profile](./frozen-capture-profile.test.ts) loads real appearance bundles
and reads the pre-optimization controller from Git, rather than preserving a second
implementation. Mounted diagnostic tracks are admitted by the existing temporal
fixture; this does not invent a production animation. The profile alternates the
measurement order across three repeats and checks every soldier's resulting local
pose against the original controller, outside the timed interval.

[Raw results](./frozen-capture-profile.json): Node 24.14.0, arm64, 30,000 soldiers.
At the repeated interruption on tick 11, median update milliseconds were:

| Workload | Original | Candidate |
| --- | ---: | ---: |
| Synchronized foot | 159.62 | 7.08 |
| Synchronized mounted | 460.49 | 14.90 |
| Interleaved foot | 157.84 | 155.25 |
| Interleaved mounted | 674.95 | 720.56 |

All 2,520,000 posed outputs matched exactly. Synchronized capture retains one
immutable source; interleaved release phases retain 30,000 foot / 50,000 mounted
sources. Different soldiers are not coerced to a common pose. Independent fallback
is not free: the archived mounted median is 6.8% slower, with allocation/GC noise
across runs. This optimization does not solve worst-case independently staggered
animation. Hardware frame gates must still judge the integrated result.

Profiling isolated the original interruption cost into rig sampling, blending, and
frozen-array copying. Sample-only reuse left the latter two costs. Reusing the
complete exact immutable capture avoids all three on a match, without changing
arithmetic for any soldier.

## Verification and changed behavior

The [focused controller tests](../../../../../web/tests/actionTimeline.test.ts)
verify immutable shared payloads and later independent actions, mixed appearances
and masks against isolated controllers, fractional blend weights, simultaneous
frozen lanes, overlay exit to the current base, tiny nonidentical release phases,
rewind/reset, and replacement rigs. The sharing test first failed with 32 distinct
snapshots where one suffices, then passed. Existing controller/replay tests passed
unchanged; the combined focused run passed 30 tests and web typecheck.

Change ledger: four added tests now establish the cases above; no existing test was
rewritten or re-pinned. `snapshotBytes` counts unique controller-owned numeric
payloads, so sharing does not report the same array once per soldier. Array/object
overhead and consumer-retained old samples remain outside that metric.

## Decision audit and review

- **Two-entry exact reuse, per update — sound, high confidence.** When adjacent
  soldiers capture the same complete displayed pose, they can retain the same
  immutable numbers. A different clip phase, blend weight, frozen-source identity,
  appearance, or overlay destination takes the ordinary evaluation path. Two entries
  accommodate adjacent base/upper-body captures; no persistent map grows with the
  crowd. This scope was explicitly requested. The private two entry records are
  reused on misses to avoid adding allocation churn.
- **Unique-payload memory accounting — sound, medium confidence.** A hundred
  soldiers holding one frozen array now report that array once. Counting it a
  hundred times would obscure the memory improvement. The plan did not explicitly
  choose duplicate-versus-unique accounting; this makes the existing owned-payload
  meaning accurate. Consumers must not interpret this number as process heap size.
- **No pose arithmetic changes — sound, high confidence.** Sharing exact results
  was chosen over rewriting low-level interpolation. This keeps arbitrary independent
  histories correct but leaves their expensive fallback in place, as measured above.

Shape/diff/docs self-review found no second sampler, persistent cache, mutable
snapshot, simulation change, or new external dependency. No additional review agent
or GPU run was launched in this delegated pass; root owns independent integration
review and hardware verification. The parent slice should link this evidence on
integration.
