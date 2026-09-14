# Planning decisions and synthesis

## User-owned decisions

- Work in a new worktree; create the plan before optimization implementation.
- Address battle stutter during camera movement/zoom and when horizon views expose more units.
- Make shadows readable by default at the supplied tactical zoom; savings must exceed their added cost.
- Engine replacement is allowed, including raw WebGPU, TypeGPU and vgpu comparisons; substantial parallel work is allowed.
- Hard cutover with no compatibility or migrations was explicitly confirmed. Preserve gameplay/save contracts without introducing migration scaffolding.
- Follow-up: a permanent **in-game menu benchmark** runs a real battle's intense five-minute contact window with human-like pans/zooms and shows average/lows/highs and a spike chart. This became required 01a–01c, before backend comparisons. A developer-only benchmark is insufficient.

60 fps on the current Mac is a recommended planning assumption. The user endorsed the in-game benchmark idea but did not explicitly specify a frame-rate number; retain that distinction. The image identifies player strength, not total army size, GPU, seed, exact camera or DPR.

## Independent draft synthesis

Three fresh read-only agents inspected real code with distinct lenses. Fewest-slices proposed evidence→combined implementation→acceptance; risk-first separated measurement, choice and cutover; seam-quality separated grass residency and crowd submission ownership. All agreed on matched hardware replays, current single-map shadow default, the weakness of the legacy paused 33ms gate, and conditional engine selection rather than a promised migration.

Accepted their shared evidence-first approach, but rejected the broad combined implementation slice: sampling publication, GPU fill, crowd packing, visibility, shadow coverage and temporal stability can each fail for different reasons. These now have separate contracts. The user-requested menu benchmark also needs distinct lifecycle, camera and results contracts; 01a–01c supply them. Backend candidate work is parallel behind one frozen fixture, and timing is serialized to avoid host contention.

The seam-quality finding that GPU telemetry is render-only is verified in `world.ts`; the source itself acknowledges that boundary, so the spec calls it an evidence gap, not a newly discovered timer defect. Repeated camera/grass calls are investigation leads rather than proven bottlenecks. Existing GPU routing, size gates and LOD hysteresis are retained as controls.

A separate Claude Opus read-only consultation was requested to diversify vendor perspective. Its full response is archived in [the consultation](assets/research/claude-consultation.md); it is not authority over verified code. Accepted the need to measure shadow-frustum population/pose work together and the separate stepped grass radius thresholds, both verified in source. Rejected its inference that the screenshot proves DPR 2 and 7,780 total men, its assertion of a full million-record diagnostic scan (source caps at 200k), and its unsupported zero-visual-risk resolution downgrade. Render-scale reductions are not part of this quality-preserving plan. Sim worker migration and automatic input smoothing were not adopted: measure those boundaries first, preserve scope and current input responsiveness. Claims that a fitted shadow necessarily saves enough or that engine replacement can only change fixed overhead are hypotheses, not established findings. No draft was given another draft, and no agent ran competing hardware benchmarks.

## Alternatives deliberately left to measured choice

- Three vs raw vs TypeGPU vs vgpu: no speed claim before equal-feature comparison. Previous skinning-only results do not settle orchestration performance.
- Persistent ring vs spatial tiles: 04 decides from latency, memory and forward-progress evidence, rather than prescribing a new streamer in ignorance of the existing one.
- CPU vs GPU crowd classification: 07 requires a net win including upload/compute costs; GPU is not automatically better for every population.
- One fitted map vs cascades: 08 starts with readable receiver coverage and measures resolution/caster cost; defaulting to more cascades is not acceptance.
- Adaptive runtime camera vs frozen action-aware tour: choose a frozen tour scouted from the battle for comparable timing. It follows actual action but cannot change its workload to accommodate a slower renderer.

## Ownership/refactor audit

Every new concept has one owner: benchmark run lifecycle, benchmark camera tour, pure metrics, result presentation; existing rendering owners keep projection, environment, terrain, state, audience and resources. Diagnostic reports consume owner-produced values. There is no second simulation or duplicate camera math. The lab-only backend interface is not exported as a production abstraction. Conditional migration files must be materialized at 03 and obsolete owners removed at cutover. Archived research handoffs are labeled historical so they cannot authorize unrelated pushes or merges.

## Scrollback audit

The screenshot is copied into assets. Performance concerns, default shadow requirement, alternative engines, parallelism permission, new-worktree scope, no-compatibility reply and menu-benchmark follow-up all appear in README and their owning slices. Existing historical performance claims remain labeled as historical. No implementation tests or hardware results are claimed by this planning pass. The next agent starts at 01 without needing the conversation.

## Final plan review

Independent seam audit found and corrected four issues: 01 now excludes the later menu-benchmark dependency and captures that baseline after 01c; 02 has an explicit benchmark-only candidate build path for live comparisons; 300-second and per-phase performance verdicts are explicit; and benchmark camera ownership excludes manual input while keeping Cancel. Local links and whitespace were checked.
