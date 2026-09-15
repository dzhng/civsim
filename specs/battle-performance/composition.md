# Complete-scene comparison pickup

Component equivalence is evidence to compose, not permission to rank an incomplete backend. The following sequence keeps integration variables separate while converging on slice02's original full-frame contract.

1. **Shared HDR frame.** Sky, opaque terrain and authored mesh crowd use one camera, depth attachment and final grade/bloom. Check tactical and horizon views at source sample count; four samples are an additional diagnostic. Preserve cold and repeated presentations separately so readiness cannot be hidden by an unexplained warm-up. Root owns the native frame control.
2. **Runtime-owned mesh and grass work.** TypeGPU/vgpu own pose compute, material mip preparation, resources and actual encoding. Their public APIs determine submission cost. CPU grass sampling/residency and normalized routing policy have one shared owner; extracting it preserves current work and cancellation semantics. Production optimization follows the backend decision.
3. **Complete content.** Add persisted impostors for the full catalog, base/focus grass, terrain vista/water where present, scenery, standards, unit readouts and depth-tested tactical cues. Each must appear in matched source/candidate output and emitted-work accounting. No hidden Three rendering in a native candidate.
4. **Same directional shadows.** Reproduce the current source shadow fit, caster audiences, bias and filter before measuring improved tactical coverage. Compare shadow-on/off cost and image masks independently from material/geometry. The final desired stronger coverage is slice08; existing weak coverage is only the control.
5. **Actual command history and live entry.** Feed the identical durable command recording to all candidates, preserving source frame groups and resolved assets. Compare origin/pan/zoom/horizon windows. Then wire each complete candidate to the actual menu benchmark and run serialized repeated timing. Exact replay is correctness evidence; the live run owns user-visible performance.

Keep source behavior, framebuffer and content fixed throughout the parity round. Explicit edge-precision diagnostics remain in evidence; independent visual and motion review determine whether they affect readability. Existing regression and performance gates are unchanged. Missing content, unverified lifecycle, missing shadow work or incomplete live integration keeps a candidate unrankable.

## Assembly contract

The live presentation order starts with ActionTimeline interpolation and unit readouts, then seated crowd upload and camera preparation; tactical-line submission closes the frame. A native owner must consume those presented inputs rather than rereading raw simulation arrays. Main and shadow audiences share visibility policy but retain distinct hysteresis histories. Mesh uploads that return L3 selections still require real per-appearance impostor draws.

Preserve separate opaque and transparent ordering: background and terrain underlays precede opaque world content; transparent far fog follows opaque soldiers. Readouts are opaque cutouts and precede the transparent list even though their renderOrder is high. Ground cues, effects and attack triangles retain their source depth/order contracts. Attack triangles are live combat content despite their internal debug name. Aerial distance uses the source observer at camera focus XY and zero elevation. CSS height controls readout sizing; physical framebuffer height controls LOD and grass.

Initialization owns asset/pipeline admission and first presentation; live frames must not settle grass or wait for queue completion each time. Resize replaces framebuffer attachments without invalidating borrowed camera layouts. Settings, terrain replacement, pending asynchronous uploads, cancellation and disposal need explicit ownership before live timing. Component owners are reusable evidence, not a second simulation or a permanent backend switch.

Each recorded draw owns its crowd upload and pose compute. A render-only command refreshes billboard view metadata without advancing LOD history or recomputing poses. Grass update starts at draw; resolved publication is consumed at preparation for presentation. Keeping these boundaries distinct allows the same coordinator to replay multiple updates before a render and camera-only renders between simulation ticks.

## Live asynchronous presentation

The production loop currently treats crowd/readout uploads and tactical-line submission as synchronous, and its application frame callback ignores return values. Library candidates have real asynchronous resource admission. Their live integration must therefore await the ordered presentation before recording its completion and exclude overlapping frame mutation. A promise queued behind a synchronous facade is not a completed presentation and must not inflate the benchmark's submission count. Preserve each ActionTimeline input and include elapsed preparation in frame latency, while recording asynchronous wait separately from CPU work. GPU queue-completion fences remain capture/readiness tools, not a per-frame scheduling policy. Scene exit must prevent an awaiting frame from touching released simulation state or HUD.

## Post-cost attribution checkpoint

The first instrumented TypeGPU live control reports substantial post-pass time.
Those shared-host runs advance different amounts of simulation and cannot rank
backends. A read-only audit finds matching physical resolutions, thirteen passes,
sampling counts and bloom formulas across native and Three implementations. One
unproven code-generation difference is dynamically indexed local blur weights in
native WGSL versus uniform coefficients in Three.

Before interpreting that cost as an engine disadvantage, reuse the fixed-HDR post
control at the same physical framebuffer. Record each post pass without changing
batching or awaiting per-pass fences, with bloom enabled and disabled. Preserve
the existing image/numerical comparison. Only if blur dominates should a later
single-variable coefficient-storage experiment follow. This checkpoint attributes
cost; it does not replace complete Menu trials or authorize a fidelity reduction.

The [range control](assets/02-live/post-timestamp-ranges/README.md) now proves
that overlap inflates native pass sums. Do not proceed to a blur-coefficient
optimization from those sums. The next seam is comparable source/native raw GPU
ranges and calibrated aggregation, then fresh matched timing. Historical live
runs still prove functional validity and query correlation, not GPU elapsed cost.
