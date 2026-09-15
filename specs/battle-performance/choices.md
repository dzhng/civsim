# Implementation choices

## Provisional — backend comparison

### TypeGPU atlas preparation uses its experimental command encoder

The pinned TypeGPU API exposes typed render-pass viewport and scissor operations through its public experimental command encoder. The PMREM candidate uses that API to keep resource, pipeline and command ownership inside TypeGPU, rather than hiding a raw implementation behind its name. Numerical controls pass, but the API's stability remains a maintenance cost to weigh in the backend decision; this does not select TypeGPU for production.

## Sound — medium confidence

### Mesh draws stay batched despite fragment-boundary differences

The comparison keeps efficient mesh draws instead of splitting every triangle to force identical derivative grouping. Isolating a triangle can change its shading derivatives without changing its current-pixel geometry or animation. The exploratory numerical diagnostic remains visible; component image equivalence is judged with independent boundary analysis and visual/motion evidence. Full-scene readability and performance still determine backend eligibility. This avoids turning a diagnostic artifact into a costly production rendering rule.


### Frame percentiles use nearest rank

When a recording has a small number of frames, there are several conventional ways to report its 95th-percentile frame time. The metrics module picks the first observed interval at the requested rank instead of interpolating an interval that never occurred. The plan specified percentiles but not the convention. This keeps reported spikes traceable to real frames; future reports and the chart use the same rule. The separate 1%/0.1% low FPS definitions remain exactly as specified. Landed with the metrics foundation.

### The in-game scenario uses the screenshot's generated army

The actual custom-battle menu's Balanced Host is a different 17-unit roster, while `start_battle_generated(7)` has the screenshot's 20 units and 7,780 men per team. The benchmark will use that deterministic generated setup with explicit orders for the player army and the existing enemy commander, rather than silently substituting the menu template. The plan left reconstruction to acquisition. This determines workload identity and is versioned before renderer comparisons; it does not alter normal custom battles. The sustained-contact scout and full menu run fixed the first-contact start tick at 9000.

## Sound — high confidence

### Empty measurements remain unavailable

If no positive finite frame interval was recorded, the result returns null FPS/timing metrics and an explicit invalid count. Returning zero FPS would confuse a cancelled or broken recording with a measured stalled renderer. A chart also counts rejected timestamped samples, keeping unavailable evidence visible. The plan did not prescribe empty-data output semantics. Landed with the metrics foundation.

### Camera cadence and submitted frames are separate observations

A frozen battle can run browser animation callbacks without submitting another GPU frame. The loop therefore counts its iterations separately from the renderer's main submissions. A benchmark can distinguish cached repeats from rendering, instead of reporting a fast empty loop as high FPS. The narrow debug API copies one small completed sample, so consumers cannot mutate the producer or trigger a traversal of all terrain/crowd stats for every interval. Existing GPU timing stays explicitly render-pass-only and asynchronous. Landed with the frame telemetry foundation.

### Camera path follows a scouted battle, not whichever renderer is keeping up

The scout shows combat starting on the east side and concentrating on the west later. The tour now pans between those recorded locations, and its later close views stay over the western fighting. It samples by elapsed time, so missed frames cannot shorten the path or select an easier view. The plan delegated anchors, not workload changes during comparison. Browser framing and the start hash passed before the scenario was frozen.

### Native SVG chart keeps the largest stall visible

The completed result uses an SVG chart with a width-sized set of min/max bins. A one-frame stall remains the bin's maximum and is drawn at its original time; it cannot disappear into an average. A fixed chart height and labeled phase bands keep the view compact, while pointer/keyboard inspection exposes source measurements rounded for readability. The JSON retains full precision. This avoids a chart dependency. The plan delegated layout/tool choice; the raw metrics and untruncated spike requirement remain unchanged.

### Preparation retains a valid view while advancing history

The benchmark advances actual simulation ticks in small yielding chunks but redraws only the initial and contact views during preparation. Intermediate history is not part of the measured workload. Redrawing every skipped tick made preparation unreasonably slow and created GPU work unrelated to the benchmark. The timed battle still draws normally, including new camera-driven work. This changes benchmark preparation only.

### Results keep navigation visible while the report scrolls

The report body scrolls within the game window while rerun, export and menu controls remain in a fixed footer. A complete result can be long, especially on a smaller window. The first browser capture showed the controls below the initial viewport, so the final layout gives them a persistent place rather than requiring the player to discover scrolling.

### GPU results follow their submission, not the latest callback

Asynchronous GPU results can arrive out of order and after the benchmark ends. The recorder joins them to explicit CPU submission IDs, retains bounded terminal events, and marks unresolved results instead of guessing. A report is fixed at termination; it does not wait on GPU readback or silently change after export. This provides attribution without turning the measurement into a synchronization stall.

### Scheduling and animation preparation get separate implementation gates

The actual contact profile shows expensive simulation batches and pose-transition work above the renderer. These are now named slices alongside GPU optimization. Scheduling may isolate main-thread blocking, but cannot claim to restore simulation throughput without measurement. Every implementation must retain gameplay and pose semantics, and shared-layer changes require refreshed backend controls.

### Comparison captures preserve exact values and stop before hashing

The lab records actual production presentation inputs through a build-only renderer subclass. Typed arrays and shared immutable frozen poses retain exact bytes; a bounded archive prevents full battle history from accumulating. After requesting the boundary image, capture cancels its explicitly partial benchmark so hashing does not compete with continued simulation. Capture is a correctness tool, never a timing score. The adapter and capture machinery remain lab-only and have no production compatibility obligation.

### Native candidates share parameter data and shader algorithms, not runtime owners

Environment and post policy values live outside Three so all candidates consume the same authored lighting and grade. Native sky algorithms can be shared WGSL, while each candidate owns its resources, pipelines and encoding through its advertised API. The independent Three numerical control stays in the verification entry. Passing one component cannot qualify an incomplete battle renderer for ranking.

### Build feasibility does not change the production compiler

A faster measured window from the existing no-opt profiling artifact is insufficient to choose release settings: executable differences and transient spikes remain unresolved. Preserve the current production build until a controlled causal probe and full live benchmark support a change. This avoids promoting a profiling artifact into the release path on incomplete evidence.

### Candidate depth and beauty preserve identical vertex placement

Native grass marks clip position invariant so its equal-depth prepass and beauty pass cannot disagree because the compiler rearranged arithmetic. This requirement applies to that shared-depth contract, not automatically to every scene component. The single-pass impostor omits the annotation, matching its source; adding it caused filtered-normal differences without supplying a cross-pass benefit. Other mesh cases remain independently tested. The component comparison retains the existing Three prepass defects as explicit reference differences; it does not reproduce missing grass merely to obtain a zero pixel diff. Full moving-scene acceptance still owns coverage and performance.

### Existing material quirks remain part of the comparison control

Pure terrain and water parameters now have backend-independent owners. The comparison preserves the current water color conversion and source geometry rather than quietly improving them during a backend test. Any visual correction must be a separately evidenced change, so renderer selection measures the same scene.


### vgpu targets have explicit checked disposal

The pinned vgpu runtime exposes target destruction but omits it from its public TypeScript interface. Borrowed-device disposal leaves target attachments alive. One checked helper calls that runtime method and fails clearly if it disappears; candidate controls verify every owned texture is destroyed. This is an experimental API maintenance cost for the backend decision, not a production compatibility layer.


### Impostor atlases are authored offline and shared as immutable inputs

The comparison uses one saved property-atlas artifact for Three and all native candidates. Three is allowed in authoring, while the runtime loader has no Three dependency. Input and payload hashes detect stale or damaged assets; a separate fresh-bake check exposes the source's small GPU rounding variation instead of silently changing the comparison input. This adds upfront loading/decompression and avoids runtime atlas baking.

### vgpu pose computation uses its public submission model

The pinned vgpu compute API submits each dispatch itself. Its candidate therefore submits one active-rig compute pass before frame drawing, preserving queue order and reporting the extra submissions as a backend cost. It does not reach into private pipelines to mimic TypeGPU's shared-encoder path.

### Existing directional shadow control

- **Settled:** Keep shadow fitting/filter constants in the shared policy and the native depth texture, camera buffer and sampling state in one shadow owner. The frame supplies camera bindings and caster selection, so lighting construction does not depend on frame construction order. This avoids a second fit policy or a hidden Three resource dependency.
- **Settled:** Verify the existing filter with an isolated visible mask before combining it with material lighting. Double-sided primitive geometry controls side selection only in this probe; real crowd/scenery audiences still require their own composed verification. Stronger tactical coverage remains a later measured change.

### Composed directional shadow binding

- **Settled:** Shadow receiving shares the existing environment material group. Caster draws bind only that owner’s view uniform, avoiding an illegal read/write feedback binding on the shadow texture and avoiding a fifth WebGPU bind group. Disabling shadows compiles out sampling rather than paying for unused taps.
- **Settled:** The source shadow node’s explicit public vec3 conversion has a narrow typed output assertion in the control, because the pinned declarations return an untyped Node. The assertion describes the conversion already requested from Three; it adds no alternate renderer or runtime behavior.

### Scenery parity and immutable atlas input

- **Settled:** Keep battle prop selection and instance packing in shared data, while each renderer owns its buffers and passes. The native immutable-image uploader accepts packed RGBA data through the same mip/admission owner as bitmaps, avoiding a second mip implementation or lossy bitmap conversion.
- **Settled:** Preserve the source’s solid leaf-card caster silhouettes and opaque surviving alpha in the comparison. Finer leaf shadows would change both appearance and depth-pass work and therefore belong to an explicitly separate optimized configuration.

### Completed vista geometry ownership

- **Settled:** Build outer rings and seam strips in the shared CPU terrain recipe before any renderer creates geometry. Keep a small read-only attribute view so the same seam math accepts packed data; remove the old Three geometry-mutating adapter. Preserve final rendered attributes and winding exactly rather than creating a separate native terrain generator.

### Native vista material integration

- **Settled:** Extend the existing terrain material owner with the source vista-band policy. Only the far ring enables source-equivalent alpha blending and disables depth writes; playable terrain retains its previous configuration. Outside rings do not receive sun shadows, matching the control and keeping extra work explicit.
