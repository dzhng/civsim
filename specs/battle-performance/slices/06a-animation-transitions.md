# Bounded animation-transition preparation

## Contract and scope

Can observation and transition preparation cost less while producing the same authored poses? The live CPU profile identifies `ActionTimeline.update`, especially frozen-pose capture, as substantial work before `BattleRenderer.draw`. Camera-only invalidation cannot remove this cost: real combat changes observations with a stationary camera too.

This slice owns the engine-independent observation → transition → presented-state boundary, before the existing crowd-state/visibility work. The current semantic owners are `BattleActionAdapter`, `ActionTimeline` and `BattleCrowd`; retain one owner for each responsibility. Choose the optimization from measured work rather than prescribing a cache, pooling scheme or GPU move. Shared campaign consumers must remain correct.

## Invariants

Preserve soldier identity, equipment, source/destination poses, interruption continuity, mounted upper-body composition, ranged releases and death. Keep before/after observation boundaries, interpolation and asset-replacement invalidation. An unchanged observation is distinct from advancing animation time. Do not reduce update frequency, quantize phases, drop transitions, freeze animation or substitute simpler assets to pass timing.

Frozen sources remain stable for every consumer that retains them. Reusing storage cannot mutate another soldier's pose or an earlier interpolation endpoint. Storage/history growth must be bounded by declared live demand and transition lifetime; no unbounded memoization or blanket reservation of every possible combination. Any overflow has a tested outcome that preserves content.

## Evidence and gates

- Compare the same retained observation/playback trace before and after the change. Check sampled poses at existing tolerances through repeated interruptions, reversals, death, ranged release, mounted composition, same-boundary additions, population changes and asset replacement. Preserve existing exact identity/state oracles; do not widen tolerances.
- Capture representative infantry, ranged and mounted motion under both stationary and moving cameras. Use the root snapshot/temporal critique workflow; animation continuity and equipment remain the visual acceptance variables, with lighting and LOD policy fixed.
- Measure observation conversion, transition update/capture, sampling and presentation separately, plus allocation/GC and retained memory. Demonstrate reduced preparation cost beyond paired-run variability in the actual contact window, with no accumulating history after repeated transitions/re-entry.
- Keep the complete live benchmark and its 30 Hz simulation / 60 fps rendering targets unchanged. This slice does not authorize simulation mechanics changes and cannot conceal a remaining simulation bottleneck.

All backend candidates in a comparison round consume the same shared preparation implementation/version. If preparation changes after the original scorecard, refresh the Three control and affected candidate measurements. Presented-frame replay may exclude upstream preparation only when explicitly labeled; the live result always includes it. Do not credit an engine with work merely moved outside its timer.

The exit is a measured preparation improvement with pose equivalence, or a closed hypothesis without production edits. Follow the root review gates and verify shared consumers. Record the three failures reproduced on untouched `c924e5ce` separately as known baseline reds; do not re-bless them, weaken thresholds or treat them as permission for new regressions.

## Integrated endpoint checkpoint

Exact zero/one blend endpoints now evaluate only the pose that contributes to the output. Mid-transition blending and mounted composition are unchanged. The differential test covers 192 playbacks against the former unconditional recipe with exact equality, and ownership tests ensure returned poses cannot mutate a retained source or another result. Frozen-source layout is checked wherever that source contributes; a discarded source is not read.

Root and independent review both pass 64 focused action-timeline tests; web typechecking passes. This small engine-independent optimization integrates before selection while fixed comparison builds remain unchanged. It is not the exit gate: contact-window preparation cost, full animation motion, allocation/GC and final combined performance remain to be measured. All compared backends must consume the same implementation in the refreshed final round.

[Authored-rig differential evidence](../assets/06a-endpoint-poses/authored-rigs.json) extends the fixture check to every production appearance and every authored rig clip at four phases and four blend weights, with clip/frozen sources and mounted clip/base overlays. All 13,824 comparisons and result-mutation checks pass exactly. Rig hashes identify the tested inputs. This is a bounded pose-value/ownership check, not an observed live transition history or temporal visual verdict.

## Direct blend writes

[The late-window CPU profile and blend evidence](../assets/06a-pose-blend/README.md)
identify publication-side transition capture and garbage collection as the
first priority. Blending writes directly into its owned Float64 result while
retaining the exact former arithmetic. This removes temporary per-joint storage
without sharing mutable snapshots. Primitive throughput is improved; complete
contact-window and motion acceptance are still required before closing this slice.
