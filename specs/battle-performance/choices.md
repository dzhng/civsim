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

### Shared overlay preparation

- **Settled:** Keep tactical geometry placement in shared CPU data while each renderer retains its growable arrays. Preserve source draping, partial-input behavior and defaults exactly so a backend comparison cannot silently change visible cues or their upload workload.

### Native overlay material and ordering

- **Settled:** Preserve distinct depth-tested ground cues versus late effects in the comparison. Share authored ring constants and placement data; each runtime owns its stable pipelines and growable buffers. Improving cue readability at the horizon would be a separate visual change, not a hidden reduction or redesign in backend timing.

### Experimental public API costs

- **Settled:** TypeGPU's scenery cutout depth pass forwards raster depth through its public fragment-depth output because the pinned generator cannot emit a colourless discard-only stage. Keep the possible early-depth cost visible in the backend decision rather than using a hidden raw pass.
- **Settled:** vgpu water owns individual public buffers and lends their handles to geometry, allowing cleanup if construction fails partway through. TypeGPU realizes its owned state and bind groups before admission completes, so readiness includes their real allocations rather than deferring failure until the first draw.

### Readout texture lifetime

- **Settled:** Replace and dispose the source atlas texture when canvas dimensions change, then rebind the texture node. Repainting alone retained an incorrectly sized physical texture. Keep the shared glyph/layout recipe unchanged. Candidate owners stage atlas and instance updates before committing them; vgpu’s public admission draw and retained spare buffers are explicit comparison costs.

### Terrain underlay comparison

- **Settled:** Include the two live terrain underlay draws in the matched workload, even when opaque terrain later hides their pixels. Keep their authored style values shared and prepare native style pipelines before rendering. Measure any later reduction in overdraw as a separate optimization, rather than omitting source work from the comparison.
### Complete-scene requirements follow live owners, not unused APIs

A caller audit found the legacy battle marker layer only received empty arrays; far-LOD soldiers already render through crowd impostors. Retire that empty source layer and the newly added native marker/control scaffolding rather than porting a test-only scene component to more backends. Historical marker images remain evidence of the superseded experiment. Live ground/effect lines, rings and debug triangles share staging and shader policy across all three runtimes; actual crowd L3 rendering remains mandatory. See [the overlay correction ledger](assets/02-preflight/overlay-ports/change-ledger.md).

### Native scene publication boundaries

- **Settled:** Keep crowd updates, in-scene UI uploads and final presentation as distinct operations. Submit pose work for every recorded draw; render-only calls refresh billboard camera state without advancing crowd history. The native comparison therefore preserves real command history instead of collapsing unused intermediate updates into a cheaper workload.
- **Settled:** Share the terrain owner's captured grid with grass sampling, so asynchronous work never reads caller-reused input arrays or a different terrain generation. Renderer resources remain separately owned and dispose together at scene teardown.

- **Settled:** A failed staged terrain allocation retains the prepared scene. If terrain has already committed and a dependent grass/shadow update fails, terminate that scene instead of allowing mixed terrain generations to render. Ordinary camera updates do not replace terrain generations.
- **Settled:** Use ordinary vertex positions for composed terrain, which has no equal-depth prepass. Keep invariant positions where a separate matching depth pass requires them; do not impose that constraint on unrelated geometry.

### Shared scene preparation and pending ownership

- **Settled:** All comparison backends consume one terrain snapshot recipe and one scene input contract; callers import those types directly. Share the output-conversion math unchanged, while each runtime still owns its actual resources and submissions.
- **Settled:** An asynchronous scene operation owns its resources until its promise settles. Disposal closes the scene immediately but defers resource destruction until that operation finishes; overlapping mutations are rejected. Preserve an original operation failure even if cleanup also fails.

### Complete library control ownership

- **Settled:** Keep one full-scene fixture across comparison backends and use their actual public submission APIs. Capture at final submission before asynchronous validation can release the canvas image, then await validation before the next update. All runtime-owned caches and the presentation surface are included in teardown accounting.
- **Settled:** Keep numerical failures visible even when images look equivalent; exclude attempts changed in flight from fixed-code conclusions. Successful stills do not waive motion, lifecycle, loading or live performance requirements.

### Live presentation ownership

- **Settled:** Build one camera/time/crowd/cue packet before asynchronous presentation. Keep the source synchronous fast path, while actual asynchronous backends finish their presentation before another frame starts. Active CPU, elapsed renderer work and time awaiting a renderer are separate measurements.
- **Settled:** Exiting a battle aborts input/readiness immediately and drains the current frame before freeing its Game or reusing scene resources. Preserve unrelated failures instead of treating every error after exit as cancellation.

### Native measurement ownership

- **Settled:** Observe the libraries' public WebGPU commands with one device-owned timing observer. Keep actual scene submission identity separate from the observer's later query-copy submission. A result is usable only after the original commands validate; missing or out-of-boundary work cannot be reported as zero GPU cost. This observer belongs to the comparison lab and does not choose the production renderer.

### Comparison accounting

- **Settled:** Track requested native buffer/texture payloads and explicit destruction with bounded counters. Include profiler allocations; keep unknown formats unavailable. These figures are logical allocation accounting, not physical VRAM and not equivalent to source Three object counts.
- **Settled:** Validate exported runs offline using the game's FPS owner and explicit experiment manifests. Pair eligibility establishes comparable cadence evidence only; simulation progress, incomplete GPU data, visual parity and repeated-run acceptance remain separate decisions. Preserve rejected-pair evidence instead of producing a winner from incomplete measurements.

### Overlapping GPU timing intervals

- **Settled:** Keep pass-duration sums as diagnostics only. Observed hardware intervals overlap, so comparison uses separately named whole-presentation span and interval union after source/native coverage is aligned. Neither is labelled physical GPU busy time; shadow comparisons use matched whole presentations, not subtraction of overlapping stage sums.

### Phase attribution and missing timing

- **Settled:** Attribute CPU samples and recorded GPU submissions using the canonical camera script, including the untimed opening submission once. Report span and union only as a valid pair; partial or missing measurements remain unavailable. Phase reports reuse the whole-run distribution owners and do not infer GPU time from stage sums.

### Component report scope

- **Settled:** Keep library version identity separate from test scope. A preflight or sky control states only the work it observes; it does not declare global full-scene eligibility or carry a stale missing-pass inventory.

### Incremental timing-query control

- **Settled:** Disable native timing queries only at lab build time, while retaining device features, actual drawing, validation, submission identity and allocation observation. Report disabled timing as unavailable. The paired control measures added query/readback cost; it is not a claim that every profiler cost has been removed.

### Served asset identity

- **Settled:** Verify recorded shared assets through the links the production build actually creates. Bundled and linked files may share a directory; reject a wrong shared subtree without requiring its parent to be a symlink. Keep one canonical manifest schema and name missing fields explicitly.

### Immutable image residency

- **Provisional, verify in 03b:** Share identical immutable GPU material images within the selected world/catalog preparation, while preserving appearance-specific material tables and renderer lifetime. The catalog exposes 60 definitions of three image/sampler combinations; actual unique allocations and visual equivalence decide the implementation, not the definition count alone.

### Publication consumer feasibility

- **Provisional, delete at the production observation seam:** A lab-only snapshot reader presents one owned buffer to the existing action adapter's pointer-shaped constructor. It never owns a Game or implements action priorities. Short consumer tests extend the transport proof; they do not replace canonical contact-window, worker/browser, HUD or throughput verification.

- **Sound — high confidence:** vgpu's depth-only horizon caster declares a position-only geometry view borrowing the existing beauty mesh's buffers. A shader's consumed attributes define its view; inventing unused shader inputs or bypassing library validation would preserve the wrong contract. The beauty geometry retains buffer ownership. The small exported caster helper lets the library-backed regression test exercise this same pass; no production renderer switch is added.

- **Sound — high confidence:** completed-tick observation input exposes a cheap count before raw-view construction. This preserves the existing unchanged-tick fast path while keeping WASM and published-buffer reading behind the same typed input. Count access also enforces held-publication lifetime, so cached presentation cannot conceal a released buffer. The original eager-read draft was corrected before integration.

### Integrate verified incumbent image ownership before selection

- **When:** source image-sharing integration, 2026-09-15.
- **Choice:** Stop allocating the same soldier texture separately for every appearance in the current renderer now. Renderer comparison continues against the preserved fixed builds; if a different renderer wins, its final resource ownership must meet the same contract. Waiting for selection would leave a verified memory reduction unused without improving the comparison.
- **Gap:** The original slice order deferred all integration until backend selection; actual hardware now proves the duplicate allocation and safe replacement lifetime independently of timing.
- **Reach:** This changes the working incumbent, adds no renderer switch or compatibility path, and requires refreshed final comparisons. It does not close the motion or performance gates.
- **Verdict:** Sound, medium confidence. The ordering is reversible and fixed experimental inputs remain intact; the final renderer is still undecided.

### Evaluate only contributing endpoint poses

- **When:** 06a endpoint integration.
- **Choice:** At the instant a transition has finished, sample its destination and do not read the old pose. At its exact start, retain the source result without sampling the unused destination. A frozen source that contributes still must fit the skeleton. Each returned pose remains independently owned.
- **Gap:** The plan requires equivalent poses but leaves evaluation strategy open; removing unused reads also removes their incidental validation. Keeping validation only on contributing data preserves useful failure checks without performing discarded work.
- **Reach:** This engine-independent change enters the working branch before backend selection; fixed builds remain untouched and final comparisons must all include it. It creates no cache, mode, dependency or extra timeline.
- **Verdict:** Sound, high confidence. Exact differential and ownership checks support the behavior; live timing remains an open gate.

## Progressive grass coverage candidate

- **Provisional — motion gate remains open:** Show the largest fully resident inner region while the outer detail loads, using the same complementary base/detail mask. This keeps one coverage owner and avoids a new per-tile GPU occupancy resource. Region growth may still be noticeable; motion evidence must decide acceptance.
- **Settled:** Give incoming camera coverage first use of the existing bounded upload allowance, then use the remaining allowance to remove retired tiles. Camera motion needs forward progress; cleanup cannot consume the entire allowance indefinitely.

### Fitted shadow depth validity

- **Settled:** The default fitted shadow map uses the renderer’s public filter hook to reject receivers outside the lower depth bound while retaining its PCF kernel. This repairs reversed-depth sampling without patching the dependency or altering caster geometry. The separate CSM path keeps its prior behavior.

### Integrate grass and shadow candidates before final backend selection

- **When:** Combined-runtime checkpoint after `e30d074c`.
- **Choice:** Put the verified grass and shadow fixes into the working game so the
  five-minute benchmark can exercise their interactions with the worker and
  shared images. Keep the old fixed comparison builds untouched. Waiting for
  backend selection would leave these interactions untested for longer.
- **Gap:** The planned graph deferred dependent production integration until a
  renderer won; the individual fixes now have correctness evidence, while the
  complete result still needs performance investigation.
- **Reach:** This does not choose Three. All final backend candidates must receive
  equivalent scheduling, grass and shadow policies before comparison. Continuous
  motion, shadow cost and net performance remain required gates.
- **Verdict:** Sound, medium confidence. Combined testing is useful now, provided
  mismatched old and new workloads cannot decide the renderer.

### Keep stage clocks inside the existing diagnostic owner

- **When:** Exact-WASM stage attribution.
- **Choice:** The optional WASM timing build installs its own monotonic clock in
  the existing simulation profiler when the module loads. Every battle entry then
  measures the same stage scopes; normal builds contain none of this timing code.
- **Gap:** The existing profiler used a native clock unavailable in WASM. Native
  execution diverged from the benchmark hashes, so it could not substitute for
  timing the actual simulation target.
- **Reach:** No extra simulation implementation or dependency is introduced.
  Diagnostic builds expose reset and average-report operations; their overhead
  cannot count as release performance. Native tools keep their original clock.
- **Verdict:** Sound, high confidence. One timing owner and target-specific clock
  preserve the measured workload while leaving normal gameplay code unchanged.

### Derive owned crowd seating while building instances

- **When:** 06b duplicate terrain sampling pass.
- **Choice:** When the normal builder assigns elevations from the terrain field,
  it also records their height range. The world reports those facts directly.
  Explicit caller-owned instances still receive the original eager terrain check,
  so later caller mutations cannot change the report of a submitted frame.
- **Gap:** The existing diagnostics repeated the builder's pure height lookup;
  the plan did not prescribe how to remove that redundant work safely.
- **Reach:** The builder returns one additional scalar, elevation span. There is
  no delayed scan, retained copy, new dependency or alternate drawing path.
- **Verdict:** Sound, high confidence. The same owner establishes normal elevation
  values; external values retain validation, and matched hardware counts confirm
  fewer samples with identical diagnostics.

### Share stateful shadow fitting across renderer adapters

- **When:** Matched shadow comparison preparation.
- **Choice:** Keep camera history, extent hysteresis, terrain bounds and sun
  direction latching in one shared policy. Renderer adapters install the resolved
  fit using its revision rather than owning copies of that state.
- **Gap:** The plan required equal shadow work but did not prescribe ownership
  of the existing Three fitting state.
- **Reach:** No new quality option or dependency; the Three adapter retains its
  existing raster and crowd depth behavior. Native adapters will consume the
  same policy before engine ranking.
- **Verdict:** Sound, high confidence. One owner avoids independent hysteresis
  histories accidentally changing the workload being compared.

### Pack one native shadow frame for all three experimental backends

- **When:** Matched fitted-shadow resource checkpoint.
- **Choice:** Share native projection packing and upload revision tracking.
  Each backend retains ownership of its buffers. Crowd selection uses the body
  caster ceiling while terrain rasterization keeps the full terrain depth range.
- **Gap:** Backend APIs differ, but that does not justify different matrix,
  bias or caster policies in the comparison.
- **Reach:** No backend is selected. The lab has one packing owner; unchanged
  fits skip redundant uniform writes in each native resource adapter.
- **Verdict:** Sound, high confidence. Common policy and packing keep the
  comparison about backend costs rather than different shadow work.

### Own the last submitted crowd and invalidate actual visibility inputs

- **When:** Camera-only fitted-shadow integration.
- **Choice:** Crowd owners keep reusable copies of submitted soldier values and
  small mutable animation descriptors, while sharing readonly frozen bone poses.
  A changed frustum or projected body size refreshes the audience from that state;
  the same view does no additional pose preparation. Native impostor groups borrow
  this owned snapshot rather than maintaining a second set of copies.
- **Gap:** Both renderer paths could refit a shadow map after their last crowd
  upload. Keeping that old caster list would make the comparison incoherent.
  Borrowing caller arrays for a later refresh would expose caller mutations.
- **Reach:** One shared snapshot and visibility-input owner serve all four
  renderers. Input storage survives pending asynchronous reads during disposal.
  Snapshot storage grows to the observed population high-water mark and is
  released with the world; frozen bone arrays are not cloned per frame.
- **Verdict:** Sound, medium confidence. Ownership and invalidation are verified;
  the added scalar-copy cost still belongs in the complete performance comparison.

### Check grass content separately from capacity and camera requests physically

- **When:** Standing30k gate reconciliation after camera-only publication.
- **Choice:** Expose whole-map and focus accepted sampling independently. Keep
  the existing active summary for detail diagnostics. Check the static1M budget
  and40k accepted-content floor directly, and validate focus slot capacity and
  resident coverage without treating padded entries as grass.
- **Gap:** The previous assertions read active focus metadata as though it were
  the static sampler and assumed an obsolete pool size. Both old and new source
  failed those checks despite unchanged content.
- **Reach:** Timing, army and foliage floors are unchanged. Rendering and density
  are unchanged. Camera checks use reachable20m/10m distances and actual rendered
  travel; the old24/28 requests both clamped to10m after an earlier product change.
  Tactical pan replaces a clamped overview pan so its200m movement is real.
- **Verdict:** Sound, high confidence. The gate verifies more of its original
  intent without widening the player's camera or lowering performance standards.


### Join routine GPU validation before presentation

- **When:** Native admission scheduling pass.
- **Choice:** When a native frame uploads crowd and overlay data, let the GPU's
  error checks finish while later preparation runs. Wait for every check before
  drawing the frame. Terrain/resize changes and the final draw retain their own
  validation; CPU-only visibility reconciliation creates no empty GPU check.
  On failure, wait for remaining checks before freeing resources.
- **Gap:** The plan requires correct failure handling but does not require each
  upload to wait separately for its error report. The old sequence introduced
  measurable waits between otherwise independent preparation steps.
- **Reach:** Later CPU preparation and pose work can occur before an earlier
  upload error is known. This is bounded to the current frame, cannot produce a
  successful frame receipt, and does not promise state rollback. Operation and
  cancellation errors remain the reported cause when cleanup also finds an error.
- **Verdict:** Sound, high confidence for correctness; performance acceptance
  still requires controlled measurements. Deferred-error, startup, submission
  identity and ownership-drain tests cover the changed ordering.


### Cache successful billboard camera preparation at its owner

- **When:** Billboard refresh deduplication pass.
- **Choice:** A crowd upload still refreshes every changed soldier. If preparation
  immediately asks for the same billboard camera again, reuse the already prepared
  data. Native audience history owns copied eye/basis/FOV values; Three's billboard
  layer owns a copied camera transform/FOV and invalidates it on source upload.
- **Gap:** Visibility history alone does not describe billboard orientation and
  size, and callers can mutate camera objects in place. Object identity cannot
  establish that the view is unchanged.
- **Reach:** Camera movement and source changes still update normally. Failed
  refreshes cannot turn valid by returning to a formerly cached camera. No visual
  quality policy changes; the cache avoids repeating successful work only.
- **Verdict:** Sound, high confidence. Tests exercise field mutation, parent-camera
  motion, source changes and failure readiness; actual game-route controls retain
  matching final data fingerprints while halving the measured duplicate work.

### Keep native crowd packing capacity with the mesh owner

- **Choice:** Retain each appearance/audience/LOD payload at its observed peak,
  overwrite active records directly, and borrow the result until upload settles.
- **Gap:** The spec requires bounded frame work but does not prescribe payload
  ownership. Rebuilding maps, index buckets and record arrays repeats avoidable
  work during camera changes.
- **Reach:** Memory follows the largest bucket demand seen by that owner and is
  released with it. This trades retained capacity for fewer allocations. Async
  mesh uploads reject overlap before touching borrowed data. TypeGPU uses its
  public host buffer and an active byte range, preserving its existing CPU copy.
- **Verdict:** Sound for the measured workload. Exact payload/slot comparison and
  ownership tests support correctness; live frame-time benefit remains unproven.

### Add an intermediate mesh without replacing the distant meshes

- **When:** Complete-roster geometry control.
- **Choice:** At tactical distances, try a new model between the existing close
  and middle models. Keep the original middle and far models at their existing
  smaller screen sizes. This gives four mesh levels before the existing flat
  impostor representation. Both visible soldiers and shadow casters use the
  same ordered levels; the coarsest real mesh remains the shadow floor.
- **Gap:** The plan allowed representation changes but did not prescribe a new
  mesh count. Fitting the intermediate into three slots displaced the smallest
  model and made the zoomed-out battlefield and shadow pass do more work.
- **Reach:** The asset format, renderer routing and reported level counts must
  move together. Loading retains one extra mesh per appearance. The proposed
  new boundary is32 standing-height pixels; original18/9/4 boundaries stay.
  No legacy format or quality toggle is added. The existing detailed models,
  motion and texture data remain authoritative.
- **Verdict:** Sound as the next candidate, medium confidence. It directly avoids
  the measured distant-work increase while preserving the promising tactical
  reduction. Production adoption remains subject to transition, memory, camera
  and live-performance gates; a fourth level is not itself proof of a win.
