# Implementation choices

## Sound, with maintenance or measurement limits

### TypeGPU owns the battle renderer

The user preferred TypeGPU's type safety when its measured performance tied raw
WebGPU. The game therefore has one TypeGPU battle owner and no legacy-renderer
fallback. Retained WGSL bodies are explicit boundaries: typed interfaces help
prevent layout mistakes, while shader validation still checks their contents.
The pinned experimental encoder is a maintenance cost accepted to retain typed
resource and submission ownership.

### Performance is judged by bounded evidence

Exact replay measures CPU preparation without attributing unrelated rendering or
simulation work to that improvement. The menu benchmark reports the real live
experience, including stalls. Unmatched ending ticks and host activity prevent
casual comparisons from becoming claimed renderer speedups. The user's revised
closing bar accepts measurable improvement without a 60 FPS promise.

### The shadow map follows visible ground

One fitted, stabilized map is the default, with separate shadow-only caster
visibility. This spends resolution near the camera while retaining bodies outside
its view that cast into visible ground. High quality retains cascades. Repeated
rank shadows and weak distant canopy readability remain visible limitations;
they are not hidden by disabling default shadows.

### The camera tour follows a scouted battle

The benchmark visits recorded combat locations on an elapsed-time path, including
close, wide and horizon views. It does not let renderer speed choose a shorter or
less demanding tour. The simulation remains live, so different machines can reach
different ending ticks; the report retains that distinction.

### Historical renderer probes are retired explicitly

Checks that instrumented Three meshes, materials or scene internals were removed
with the implementation they tested. Portable policies and numerical/lifetime
contracts remain executable against current owners. Old experiments remain in
Git history and their evidence reports; no compatibility renderer is maintained
solely to keep its internal-object tests running.

## Sound

### Gameplay and rendering remain separate

The renderer consumes coherent presentation data; it does not own simulation
rules, save formats or camera input. Campaign rendering keeps its existing WebGPU
owner. No data migration or legacy compatibility layer is added, as requested.

### The production catalog is strict

Gameplay requires every roster appearance and its published offline property
atlas. Authoring can explicitly load a mesh-only subset, but a missing production
atlas never silently changes quality or substitutes a different representation.

### Shared images retain independent material tables

Immutable image textures are shared within the catalog preparation that owns
them. Appearance-specific materials and samplers stay independent, so deduplication
reduces resource cost without conflating material identity. Replacement owns a new
catalog generation rather than mutating textures used by the displayed one.

### Pose optimization preserves immutable snapshots

Direct channel evaluation, blending and frozen copying retain the same pose values,
sharing and ownership semantics. Frozen poses remain immutable; no new mutable
cache is introduced to obtain a faster number.

### Replacement and disposal are transactional

Resources are prepared and validated before becoming the installed world. Failed
admission keeps the last valid generation. Disposal rejects late use and waits for
owned work before release. A resized scene that cannot be validated is disposed,
rather than publishing mismatched canvas and frame resources.

### Reload does not blend across different rigs

The staged renderer can carry an admitted pose through replacement. Once the
frontend accepts a new catalog, its animation timeline resets playback; this avoids
blending samples from potentially different rigs while keeping the same battle tick.

### Diagnostics describe actual ownership

World counts and anchors come from installed/uploaded resources. Whole-army seating
verification is explicit and never runs as a hidden per-frame population scan.
Requested buffer/texture counts and bytes are logical allocations, not physical
VRAM. Indirect-draw wiring is reported without pretending to know GPU-resolved
blade counts.

### GPU timing follows the presented submission

A frame receipt is joined to its own completed timestamp observation. Overlapping
passes are not summed into a fictitious frame total. Unsupported, incomplete or
unqueried measurements stay unavailable; readiness submissions are separate from
primary battle draws.

### Freezing waits for a new presentation

Authority publication does not prove the display consumed that state. The freeze
barrier therefore waits for a presentation begun after the request before settling
its image; cancellation or disposal rejects the wait. Canvas stability checks read
the actual framebuffer, because a DOM-composited screenshot also includes HUD
rerasterization unrelated to the renderer.

### Benchmark preparation is outside the measured window

The actual simulation advances to the recorded contact tick without rendering each
skipped historical frame. The timed window starts from the verified state and draws
normally. A cancelled run remains an explicitly partial result.

### The chart preserves stalls

The SVG chart reduces samples into visible-width min/max bins. A large single-frame
stall survives that reduction; pointer and keyboard inspection reveal its time and
value. JSON export retains original samples rather than chart approximations.
Result navigation stays visible while the report body scrolls.

### Research assets do not ship implicitly

Neither the rejected closer coarse-LOD shortcut nor the promising intermediate-mesh
experiment changes the production catalog. Camera-reuse and grass-transition
experiments also remain unadopted until their own outstanding evidence justifies
publication. Their reports are retained so future work can resume from evidence.
