# Choices inherited by the final implementation

Historical run artifacts have been removed. References to experiments below
record past findings; they are not links to retained reports or captures.

This ledger describes the maintained implementation, not the path taken to build
it. Rejected candidates, deleted experiments, historical measurements and retired
verification attempts belong to the acceptance evidence.
The user's decisions—TypeGPU, default shadows, the menu benchmark, no compatibility
or migrations, and removal of experimental machinery—are requirements, not agent
choices listed below.

Review the first three entries first: preserving every simulation observation can
slow the battle, catch-up has a ceiling, and the camera follows a recorded tour
rather than discovering action live. Confidence means how sure the audit is that
the user would choose the same tradeoff. It is not a test-pass rating. No unresolved
unsound or user-only choices are asserted here; all entries are sound, with the
lower-confidence tradeoffs first.

## Sound — medium confidence

### 1. Slow the simulation instead of losing completed observations

**When:** worker integration. **Choice:** one worker owns the actual battle; the
page owns drawing and input. After each live tick the worker transfers a completed
state through a pool of two reusable buffers. If neither buffer is free, it waits
for the page to return one. In plain terms: `no free buffer → no new tick`. Drawing
can keep using the state already received. An alternative would overwrite an
unconsumed state, potentially hiding a death or projectile release from animation.

**Gap:** the performance request did not specify whether overload should cost
memory, observations or simulation speed. **Reach:** this bounds queued state and
preserves observations, but a smooth camera does not prove combat is advancing at
real-time speed. Future consumers must return transferred buffers promptly.
**Verdict:** sound; completeness and bounded memory are explicit instead of silently
losing events. **Confidence:** medium.
[Owner](../../../web/src/battle/sim/battleAuthority.ts).

### 2. Abandon excess wall-clock debt after bounded catch-up

**When:** worker scheduling. **Choice:** after a stall, one scheduling cycle runs at
most four overdue ticks. If it remains behind, it resumes from the current clock
instead of chasing that debt forever. It does not skip combat calculations:
`run next sequential ticks up to limit → discard remaining elapsed-time debt`.
An unlimited catch-up loop could perpetuate the overload that caused the stall.

**Gap:** the task did not define overload timing semantics. **Reach:** a slow machine
can finish fewer battle ticks during the same five-minute recording. Hidden tabs
and loading covers explicitly suspend live ticking rather than accruing more debt.
**Verdict:** sound; work remains bounded and slowdown remains observable.
**Confidence:** medium. [Owner](../../../web/src/battle/sim/simTiming.ts).

### 3. Follow a scouted camera tour, not a live spectator AI

**When:** benchmark camera implementation. **Choice:** the benchmark camera follows
an elapsed-time path through locations scouted from its deterministic scenario,
including close, wide and horizon views. A slow machine receives the same camera
schedule rather than a shortened route. A live director could instead chase where
its current battle happens to be fighting, but would change the measured workload.

**Gap:** human-like movement was requested without specifying adaptive direction.
**Reach:** the workload is repeatable, but a slow simulation can reach a location's
action later than the camera. Different ending ticks remain visible in the report.
**Verdict:** sound; repeatability is useful for a performance benchmark, with the
lack of live direction disclosed. **Confidence:** medium.
[Owner](../../../web/src/battle/benchmark/benchmarkCamera.ts).

### 4. Concentrate default shadow detail into one fitted map

**When:** shadow integration. **Choice:** a shadow map is an image of depth seen from
the sun. Default quality fits one such map to relevant visible ground and stabilizes
its movement; High uses several distance ranges. Covering the entire battlefield
with the same default map would spread its limited resolution too thinly.

**Gap:** the user required visible default shadows, but not the allocation strategy.
**Reach:** default quality has a bounded shadow-pass cost; dense rank patterns and
weak distant canopy readability are still possible. Future shadow changes must be
judged at the tactical camera, not just at a close model preview. **Verdict:** sound;
it spends detail where players can see it. **Confidence:** medium.
[Owner](../../../packages/battle-renderer/src/battleScene.ts).

### 5. Pin the experimental TypeGPU encoder and keep explicit WGSL boundaries

**When:** TypeGPU conversion and production cutover. **Choice:** the command encoder
records GPU work. The pinned experimental API supplies needed operations while
keeping resource layouts and submission under TypeGPU. Some shader bodies remain
WGSL, the language WebGPU executes: typed bindings constrain their inputs, but their
expressions still require shader compilation and numerical checks. Rewriting every
body as a typed function, or escaping to a second raw owner, were alternatives.

**Gap:** the user selected TypeGPU's safety without prescribing every API or shader
representation. **Reach:** dependency upgrades need deliberate validation, and
TypeScript does not prove every retained shader expression correct. **Verdict:**
sound; the safety boundary is explicit and there is one production GPU owner.
**Confidence:** medium. [Owner](../../../packages/battle-renderer/README.md).

### 6. Retain staging capacity through camera movement

**When:** crowd packing and submitted-state ownership. **Choice:** reusable working
arrays can grow with demand and retain their capacity when fewer soldiers are
visible. Panning away does not repeatedly free arrays only to recreate them when
panning back. The alternative saves idle memory at the cost of repeated allocation.

**Gap:** the task did not choose a memory-versus-allocation policy. **Reach:** working
memory can follow the largest demand seen during a renderer lifetime rather than
the current visible count; disposal ends that lifetime. **Verdict:** sound; it avoids
avoidable camera-driven allocation while retaining an ownership boundary.
**Confidence:** medium. [Owner](../../../packages/crowd-runtime/src).

## Sound — high confidence

### 7. Copy coherent published states across an exclusive ownership boundary

**When:** worker transport. **Choice:** the worker packs the fields belonging to one
completed tick into one transferable buffer, with counts describing its layout.
The page copies the fields it must retain before returning that buffer. It does not
hold views into storage the worker can mutate while drawing. Static terrain is
published separately rather than resent on every tick.

**Gap:** separating simulation from drawing required a transport and ownership
contract. **Reach:** new published fields must join the shared layout; consumers
cannot retain borrowed buffer views after returning them. **Verdict:** sound;
coherent tick data avoids mixed-time state and exclusive transfer avoids races.
**Confidence:** high. [Owner](../../../web/src/battle/sim/publicationLayout.ts).

### 8. Order commands and invalidate stale asynchronous input

**When:** worker/input integration and final input correction. **Choice:** commands
carry sequence information and apply at tick boundaries. A selection query may
return after the last pointer movement: if the gesture is still current, drag
calculation uses the retained latest pointer; if cancelled or replaced, its answer
is ignored. In short: `response → current gesture? update it : ignore response`.
Applying every late response would revive cancelled gestures.

**Gap:** the old immediate-query assumption no longer held across a worker boundary.
**Reach:** future input features must handle asynchronous answers and bounded command
queues rather than assume queries return synchronously. **Verdict:** sound; order
and gesture identity, rather than lucky timing, determine behavior.
**Confidence:** high. [Owners](../../../web/src/battle/input.ts),
[protocol](../../../web/src/battle/sim/protocol.ts).

### 9. Keep campaign outcomes with the simulation that fought the battle

**When:** worker/campaign handoff. **Choice:** when campaign requests an outcome, the
worker reads it from its authoritative game before freeing it. On failure it tries
to return that same outcome before teardown; unavailable remains unavailable. The
page does not reconstruct casualties from whichever picture it last displayed.

**Gap:** moving the simulation changed where campaign could obtain results.
**Reach:** outcome handling remains asynchronous, and a renderer failure cannot
justify inventing a battle result. **Verdict:** sound; strategic consequences come
from combat authority rather than potentially stale presentation.
**Confidence:** high. [Owner](../../../web/src/battle/sim/battleAuthority.ts).

### 10. Update persistent grass coverage incrementally

**When:** grass residency integration. **Choice:** grass near the camera occupies
persistent tile slots. Camera movement produces bounded edits to those slots,
prioritizing incoming coverage before cleanup, instead of rebuilding the entire
field. Base and close grass use complementary coverage masks so they divide the
ground rather than independently painting it twice.

**Gap:** suspected grass popping did not prescribe storage or upload scheduling.
**Reach:** grass consumers must apply edit ranges and honor coverage ownership.
Incremental work reduces sudden uploads, but is not proof every transition is
invisible. **Verdict:** sound; camera movement has bounded update work and explicit
coverage. **Confidence:** high.
[Owner](../../../packages/game-renderer/src/battle/battleGrassResidency.ts).

### 11. Choose soldier detail by projected size, with adjacent-boundary tolerance

**When:** crowd detail integration and large-zoom correction. **Choice:** level of
detail means drawing a simpler representation when a soldier occupies fewer screen
pixels. A small tolerance prevents repeated switching near one boundary. A large
zoom walks every crossed boundary instead of trapping the soldier at its old
level: `while next boundary is cleared, advance one level`.

**Gap:** the task did not specify how stable transitions should handle a large zoom.
**Reach:** camera policy and model sizes must feed the same projected-size rule.
Tolerance cannot preserve a representation several levels away from the right one.
**Verdict:** sound; it handles small jitter and large gestures with one policy.
**Confidence:** high. [Owner](../../../packages/crowd-runtime/src/lod.ts).

### 12. Plan the camera's soldiers separately from the sun's casters

**When:** crowd visibility and shadow integration. **Choice:** a soldier outside the
camera can still cast onto visible ground. The renderer therefore plans visibility
for the camera and shadow view separately. Shadow demand retains a mesh even when
the main picture can use a distant image; the image itself is not a shadow caster.
Removing every camera-invisible soldier would remove relevant shadows.

**Gap:** default shadows required deciding how they interact with visibility and
simplified soldiers. **Reach:** future culling optimizations must preserve offscreen
casters and independent shadow detail. **Verdict:** sound; visible lighting is not
equivalent to visible geometry. **Confidence:** high.
[Owner](../../../packages/crowd-runtime/src/lod.ts).

### 13. Publish distant-soldier atlases offline and require them in gameplay

**When:** atlas publication and authoring separation. **Choice:** distant soldiers
use pre-rendered property images, called atlases, prepared before gameplay. A
production catalog must contain all required appearances and atlases; missing data
fails explicitly. Authoring previews may deliberately request meshes alone. A
silent missing-asset fallback would make shipped quality depend on loading errors.

**Gap:** the task did not specify when derived assets are made or how missing ones
behave. **Reach:** roster publication includes derived assets, while battles avoid
expensive startup baking. **Verdict:** sound; production requirements and deliberate
authoring subsets are distinct. **Confidence:** high.
[Owner](../../../packages/soldier-assets/bake/impostors/README.md).

### 14. Derive distant-soldier facing on the GPU

**When:** TypeGPU distant-soldier rendering. **Choice:** rotating the camera changes
which baked view of a soldier should appear. Drawing derives that view from shared
camera data and camera-independent soldier state. The CPU does not rewrite a
camera-facing record for every distant soldier on every pan.

**Gap:** atlas rendering needed an owner for camera-dependent view selection.
**Reach:** camera motion avoids that per-soldier CPU preparation, while shader tests
must protect view selection and orientation. **Verdict:** sound; the GPU already
has the shared camera information needed for the decision. **Confidence:** high.
[Owner](../../../packages/battle-renderer/src/world).

### 15. Share identical images without merging material identity

**When:** image ownership optimization. **Choice:** appearances referencing the same
immutable image share its GPU texture. Their material settings and samplers remain
independent. Reload prepares a new catalog generation instead of mutating images
that the displayed catalog still owns. Merging whole materials would incorrectly
make distinct appearances share more than their image data.

**Gap:** the optimization request left resource deduplication scope open.
**Reach:** new material features must preserve image ownership separately from
appearance settings. **Verdict:** sound; memory savings retain independent visual
identity and transactional reload. **Confidence:** high.
Evidence.

### 16. Optimize pose evaluation without mutable snapshot aliases

**When:** direct blending, channel sampling and frozen-copy optimization. **Choice:**
animation evaluates contributing channels into reusable final storage and avoids
unnecessary intermediate arrays. Once a pose is frozen, subsequent evaluation
cannot modify it through shared mutable storage. An earlier frame must remain the
same even after the next frame is prepared.

**Gap:** faster animation could have been obtained by weakening snapshot ownership.
**Reach:** future optimizations must preserve values and immutability, not merely
similar screenshots. **Verdict:** sound; reduced arithmetic and allocation do not
change the ownership contract. **Confidence:** high.
Evidence,
frozen-copy evidence.

### 17. Accelerate local simulation work without caching mutable combat outcomes

**When:** targeting and neighbor-processing optimizations. **Choice:** repeated
membership queries use faster exact lookup, stable body fields are packed for
nearby scans, and expensive angles are deferred until required. The current combat
state and candidate order remain authoritative. Caching last tick's targeting
answer would be cheaper but could change which opponent is selected.

**Gap:** performance work did not authorize changing combat behavior.
**Reach:** future cache changes must distinguish stable inputs from state that
changes during a tick; equivalent outcomes alone do not excuse reordered semantics.
**Verdict:** sound; the optimization reduces repeated work without inventing stale
combat authority. **Confidence:** high.
[Owner](../../../crates/sim/src/combat/targeting.rs).

### 18. Prepare and validate replacements before publishing them

**When:** world resource ownership and reload integration. **Choice:** while a new
catalog or terrain generation is prepared, the admitted world remains drawable.
The replacement becomes visible only after its required resources validate:
`prepare → validate → install → retire old resources`. A staged failure releases the
candidate. If an irreversible resize cannot be validated, the scene is disposed
rather than pretending the old canvas/resource combination is still valid.

**Gap:** the request did not specify reload and resize failure semantics.
**Reach:** changes may temporarily hold two generations, but must not expose mixed
ones. **Verdict:** sound; atomic admission is a general lifetime contract instead of
a collection of partial-load fallbacks. **Confidence:** high.
[Owner](../../../packages/battle-renderer/src/battleScene.ts).

### 19. Drain owned pending work before releasing its resources

**When:** asynchronous renderer lifecycle. **Choice:** leaving battle prevents new
work immediately, but pending work retains what it needs until it settles.
Overlapping mutations are rejected rather than allowed to race. Validation can
run alongside preparation only when successful completion remains a prerequisite
for use. Immediate destruction could invalidate work still using the resources.

**Gap:** asynchronous GPU initialization introduced lifetime ordering absent from a
simple synchronous constructor. **Reach:** new async operations must participate in
cancellation, validation and disposal. **Verdict:** sound; completion or cancellation
has an owner, and repeated battle entry does not accumulate live resources.
**Confidence:** high. [Owner](../../../packages/battle-renderer/src/battleScene.ts).

### 20. Reset playback after accepting a replacement rig catalog

**When:** frontend reload integration. **Choice:** a rig is the skeleton controlling
a model. Once a replacement catalog is accepted, the animation timeline resets
playback rather than blending an old skeleton's pose into a potentially different
one. Combat remains at its current tick. Keeping uninterrupted old animation would
assume rig compatibility the reload contract does not promise.

**Gap:** reload continuity across different model definitions was unspecified.
**Reach:** authoring reload prioritizes valid poses over seamless animation across
catalog versions. **Verdict:** sound; it does not invent compatibility between rigs.
**Confidence:** high. [Owner](../../../web/src/battle).

### 21. Report installed resources separately from presented frames

**When:** diagnostics migration. **Choice:** world diagnostics describe actual
installed terrain, uploaded anchors and requested allocations. A presentation
record identifies the camera and crowd that were actually submitted, even if newer
preparation has already begun. Whole-army seating checks run only on explicit
request; they are not hidden in every frame.

**Gap:** renderer replacement needed a truthful diagnostic contract.
**Reach:** logical requested bytes are not physical graphics-card memory, and
indirect draw wiring is not a measured blade count. New diagnostics must preserve
those distinctions. **Verdict:** sound; observations describe what is known without
adding hidden population scans. **Confidence:** high.
[Owner](../../../packages/battle-renderer/README.md).

### 22. Join GPU timings to their own completed submissions

**When:** telemetry integration. **Choice:** GPU timestamp results arrive after CPU
submission. A result joins its matching submission identity, not whichever frame
is currently onscreen. Overlapping stage durations are not added into a fictitious
total; unsupported or incomplete measurements stay unavailable. Readiness work is
separate from primary battle draws.

**Gap:** the performance request did not define asynchronous measurement semantics.
**Reach:** reports may lack GPU fields; frozen exports cannot silently change as
late results arrive. **Verdict:** sound; uncertainty is retained instead of reported
as zero or attributed to the wrong frame. **Confidence:** high.
[Owner](../../../packages/battle-renderer/src).

### 23. Freeze only after the requested state has reached a new presentation

**When:** presentation freeze integration. **Choice:** receiving a simulation tick
does not prove it has been drawn. A freeze therefore waits for a presentation
started after the request before settling its image; cancellation or disposal
rejects the wait. Pixel-stability checks read the canvas image because composited
HUD text can redraw independently of the battle framebuffer.

**Gap:** screenshots needed a completion definition across two asynchronous owners.
**Reach:** capture readiness follows actual presentation, not just worker arrival or
an arbitrary delay. **Verdict:** sound; the ordering requirement directly matches
what a frozen capture promises. **Confidence:** high.
[Owner](../../../web/src/battle/battleFreeze.ts).

### 24. Measure a defined stress scenario after yielding preparation

**When:** benchmark scenario and preparation implementation. **Choice:** a seeded
battle uses the screenshot-sized armies and defined opening orders. The real
simulation advances to its recorded contact tick in yielding batches without
drawing every skipped historical frame. Only then does the timed live run begin.
Preparing while the timer runs would mix startup cost with sustained play.

**Gap:** the user allowed starting at contact but did not define reproducible setup
or preparation accounting. **Reach:** this benchmark represents one versioned stress
scenario, not every battle; preparation is reported separately and cancellation
produces an explicitly partial run. **Verdict:** sound; comparable setup and honest
measurement boundaries are explicit. **Confidence:** high.
[Owner](../../../web/src/battle/benchmark/benchmarkScenario.ts).

### 25. Define average, lows and percentiles from raw frame intervals

**When:** benchmark metrics. **Choice:** average FPS is frame count divided by total
recorded seconds, not an average of instantaneous FPS values. The 1% low is the
frame rate derived from the mean interval among the slowest 1% of frames.
Percentiles select observed sorted intervals. Invalid intervals are counted
separately; no valid data means unavailable, not zero FPS.

**Gap:** “average, lows and highs” did not define their mathematical meanings.
**Reach:** future reports must keep these definitions comparable and distinguish a
missing measurement from genuinely slow performance. **Verdict:** sound; aggregate
numbers reflect elapsed time and retained samples. **Confidence:** high.
[Owner](../../../web/src/battle/benchmark/benchmarkMetrics.ts).

### 26. Preserve spikes when reducing samples for the chart

**When:** benchmark results UI. **Choice:** thousands of intervals cannot each occupy
a separate screen column. Each visible time group retains its minimum and maximum,
so a single long stall survives chart reduction. Pointer and keyboard inspection
expose sample details, and JSON retains original samples rather than chart groups.
Navigation remains visible while the report body scrolls.

**Gap:** the user requested a visual spike chart without specifying reduction,
accessibility or export fidelity. **Reach:** later chart simplification must not
average away the outliers the benchmark exists to reveal. **Verdict:** sound; a
compact chart and complete evidence serve different needs. **Confidence:** high.
[Owner](../../../web/src/ui/benchmark/BenchmarkFrameChart.tsx).
