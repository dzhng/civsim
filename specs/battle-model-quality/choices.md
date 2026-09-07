# Implementation choices

## Sound — medium confidence

### Use diagnostic closure to inform unfinished open-hand anatomy (08)

When a reference-led open hand has recognizable palm and finger segments but
still looks imperfect, bend a separate copy around the sword or pike's actual
shaft size. Keep the open source unchanged so both shapes can be compared.
The closed copy may expose a thumb pad that cannot oppose the fingers, or a
segment that collapses during bending; those findings feed back into the hand
construction. The alternative is to finish every detached open-hand defect
before learning whether its shape can form the required grasp.

The plan required open anatomy before equipment fitting but did not distinguish
a diagnostic bend from accepting that hand for the soldier. This decision only
changes the authoring feedback order. It introduces no runtime finger bones,
does not replace the current body, and does not relax either open/closed anatomy
or final equipment and budget gates. **Sound, provisional; confidence medium:**
a reversible copy tests the requested functional form earlier without treating
a convincing closed silhouette as proof of natural open anatomy.

## Sound — high confidence

### Fit provisional equipment before anatomy acceptance (08/09 authoring)

When a usable human body and skeleton exist but the face still needs work, begin
fitting the heavy infantry helmet, clothing and weapons to that editable body.
Previously the plan made all equipment wait for anatomy acceptance. This changes
the authoring order only: if shoulders or hands change, refit affected armor and
grips; keep reviewing the unclothed body separately. Neither the equipment nor
the body enters battle before the original quality and budget checks pass.

The plan did not distinguish equipment source fitting from final acceptance.
This allows a recognizable soldier to inform proportion and grip work without
using armor to hide defects. **Sound; confidence high:** reversible source work
advances the requested Blender units without weakening any acceptance gate.

### Queue replacement poses before exposing their materials (07 storage correction)

When a larger interruption frame needs new GPU buffers, compute its poses before
switching the crowd's materials to that new output. If upload fails, release the
candidate buffers and retain the previous output and materials for recovery.
If material construction fails, the existing crowd callback disposes its candidate
materials before swapping any of them. The next attempt uploads all needed poses
again. The alternative exposes new materials and destroys the old output before
knowing whether the replacement can be submitted.

The plan required atomic failure/recovery but did not prescribe ordering. This
retains the synchronous API and whole-generation replacement rule; callers still
receive failures, and previously displayed pixels are not promised after an
aborted frame. Future memory measurements include both generations during the
candidate submission. **Sound; confidence high:** publication follows successful
submission, with no rollback protocol or second rendering path.

### Keep packing scratch separate from resident controls (07)

When the production renderer submits another crowd frame, it reuses one CPU
array for the packed animation instructions. The array grows to the largest
worklist seen by that palette and is released on disposal. A 30,000-instance
worklist retains 2.4 MB instead of allocating that amount again each upload.
Every active word is cleared before packing so a soldier losing an upper-body
action cannot inherit stale instructions from the previous frame.

The plan required bounded costs but did not choose CPU storage ownership.
Writing straight into the resident attribute would save a copy while exposing
partial packing failures to resident CPU data. This choice keeps a separate
preparation array and the existing copy. The shared packer accepts explicit
caller storage; callers that retain independent prepared frames still allocate
their own. Future reuse callers must finish submitting or discarding a frame
before overwriting its storage. **Sound, high confidence:** bounded retained
memory removes repeated backing allocations without changing pose math or
snapshot transactions. A frame-time gain still requires measurement.

### Observe state once and construct playback only when sampled (07)

When a simulation tick arrives, the action controller records what each soldier
is doing. The render loop then asks for the pose at the displayed time. Previously
the observation step also built a complete output array which every production
caller discarded. `update()` now returns nothing; `sample()` remains the single
owner of output construction. Tests use those same two steps rather than a
compatibility wrapper.

The plan required separate observation and render clocks but did not specify
whether observing should also produce output. Future consumers must explicitly
sample after observing; rejected batches still leave the prior history intact.
**Sound, high confidence:** deleting unused work simplifies the contract without
changing motion. This is not a promise of faster frames: measured short-run CPU
timings are mixed. Integrated in0129ee2e.

## Sound — medium confidence

### Use body weights for provisional garment fitting (09 source checkpoint)

When clothing is added around the existing human, each cloth vertex initially
copies the skeleton weights of the nearest body vertex. A weight says how much
that point follows a particular bone. This lets the new garment enter the same
bend test without inventing another rig. The alternative is hand-weighting every
garment before seeing whether its shape even fits.

The plan did not prescribe the first weighting method. This is a reversible
starting point only: a skirt spanning two legs can fold badly when copying one
nearby leg, so the bend and later motion reviews must drive correction. **Sound
as candidate scaffolding; confidence medium:** it enables real fitting evidence,
but copying body weights is not evidence that garment deformation is correct.

### Share candidate export and capture settings (09 source checkpoint)

When the heavy kit is exported, it calls the same Blender export routine as the
bare human, supplying only its output folder and name. Both named browser scenes
use one private sheet helper for cameras, frozen poses and production-renderer
checks. Otherwise each new unit would copy these settings and could quietly
receive a more flattering camera or different export behavior.

The plan required one rendering path but left these authoring helpers unspecified.
This keeps future fitting subjects on the same review setup without adding a new
schema or runtime. **Sound; confidence high.** Equipment remains separately
editable in Blender; only copied meshes are joined for the existing single-skin
export contract, preserving modular source work without another renderer.

### Keep Blender candidate exports isolated from unrelated open-file animations (08 source checkpoint)

When an artist has another animated rig open, Blender can export its actions
along with a selected soldier even though that rig is in a different scene.
The candidate exports only assigned actions. If another action already owns the
required `bend` name, building stops before creating anything and requests a fresh
Blender session; it does not rename or delete the artist's action. The alternative
silently suffixes the name or includes unrelated clips, changing the harness input.

The plan required local editable source but did not specify Blender's global
action-name behavior. This constrains how the candidate script is rerun in an
occupied Blender file, not the production asset format. **Sound, medium
confidence:** unrelated work stays untouched and canonical clip names stay exact;
clean-background authoring remains the reproducible path.

### Author editable anatomy while its runtime budget is still measured (07/08 maintenance)

When the budget fixture exposes a mounted animation stall, it does not prevent
shaping an untextured human shoulder or testing an elbow in Blender. The original
strict sequence made that independent source work wait for the whole envelope.
Editable anatomy now proceeds in the workbench candidate path while07 remains
open. The alternative keeps all modeling idle until every measurement is green.

The user asked for useful infrastructure and original Blender art, but did not
require every measurement before any editable source exists. This maintenance
change separates authoring from acceptance: counts are provisional,08 cannot
close before07, and no production appearance is promoted early. **Sound, medium
confidence:** it advances the requested art without weakening a gate, at the
cost of possible topology revisions once joint runtime costs are established.
All07 requirements remain owned by07; none were removed or deferred away.

### Use a fixed field with the real battle camera for asset measurements (07)

**Confidence: medium.** Increasing the crowd must not also change its camera or
terrain cost. The budget fixture therefore uses one1024m flat field and the real
battle camera, with its default synthetic zoom range recorded in every result.
The old model-inspector framing remains a separately named stress test, not a
claim about gameplay. The unbuilt alternative would frame each crowd anew and
confound asset cost with the amount of world visible.

The plan required gameplay framing but did not select a synthetic field or
range. Future budget comparisons must retain this world; real-map simulation
and the standing foliage benchmark remain separate gates. **Sound:** shared
camera math prevents an inspector zoom value from masquerading as a gameplay
view, while fixed inputs make comparisons interpretable.

### Share exactly identical interruption poses, not soldiers' action state (07)

**Confidence: high.** When a whole formation interrupts the same pose, evaluating
and copying that pose once for every man wastes time. Each observation update
now remembers just the last two exact pose inputs and shares their read-only
results. Each soldier still owns his own action history. A different phase,
appearance, blend, or frozen source takes the original calculation path.

The plan required bounded storage and exact motion but did not choose this
optimization. Unlike phase rounding or grouping soldiers' actions, this cannot
make two different poses equal. The cache ends with the update and cannot grow
with the roster. Reported snapshot payload bytes count unique shared storage,
not repeated references; object overhead is not included. **Sound:** exact
identity preserves animation semantics. Irregular histories can miss the cache
and pay comparison overhead, so synchronized speedups are not universal claims.

### Construct prior playback only when an observation actually interrupts a lane (07)

An unchanged lane does not need a frozen copy of its current playback. The
controller defers that object construction until its existing transition callback
needs it, and reuses it for a simultaneous base/upper-body interruption. The
captured history is the old history, not the variable rebound during transition.
This keeps immutable snapshots and atomic observation semantics intact without
another cache lifetime or a change to sampling precision.

The coordinator selected this bounded seam after interruption-frame telemetry
showed observation work among the delayed-frame contributors. **Sound, medium
confidence:** exact playback/posed output matches pinned source; the timing
benefit remains unmeasured and must survive the matched production budget run.

### Give main visibility and shadow casting independent representations (07 projected LOD)

When a soldier is outside the main camera but inside the sun's shadow camera,
removing its geometry can remove a shadow that is still visible. The shared
detail planner considers both cameras without combining their representation
choices. The main view can retain a readable far impostor while a shadow-only
mesh supplies its caster. The coarsest existing mesh tier also casts; sprites
still do not. Three's built-in layers route existing mesh buckets to the shadow
camera without another render system or per-fragment visibility shader.

The resliced plan required preserving shadow contributors but did not initially
specify which existing mesh tiers could cast. The coordinator chose that boundary
after review exposed the finer-only casting policy, then explicitly resliced the
audience split after unprimed overview review rejected the combined result.
Independent geometry/material ownership adds measurable buffer payload instead
of a fragile shared-GPU-resource lifetime scheme. Both audiences use one pose
slot per soldier. **Sound, medium confidence:** CPU tests cover actual single/CSM
camera layers and unchanged pose capacity; visual readability, shadows and frame
cost still require production acceptance.

### Time a frame with scene-owned GPU markers (07 measurement)

A frame submits animation compute, shadows and its final image through separate
commands. The measurement places GPU clock markers before and after that work,
and keeps the original frame number with each delayed result. Eight reusable
readback slots bound pending work; if all are busy, rendering continues and the
missing measurement is explicitly reported. The alternative reads Three's latest
cached timing, which can mistake an old frame for a new one. The plan required
correlation but left the instrument unspecified. **Sound:** this measures queue
elapsed time, including submission gaps, not pure GPU activity; matched runs
without markers reveal instrumentation overhead. Each marker dispatches one
no-op invocation because Metal skips empty passes. Future budget claims must
retain these qualifications and reject inadequate timing coverage.

### Count requested resources in a separate allocation run (07 measurement)

When a replacement model is prepared while its predecessor still exists, a
scene-only observer counts the resources actually created and destroyed. It
aggregates counters by phase instead of storing an ever-growing operation log.
The alternative adds the old and new size formulas, which can invent overlap
that never occurred. The plan required peak and initialization costs but not
their instrumentation. **Sound:** bounded phase counters capture API-live
requested bytes, not physical VRAM; unknown texture formats remain unknown.
Mapped-at-creation capacity is distinguished from bytes proven written, and
texture payload from padded source span. Queue traffic includes pre-existing
world resources even though their allocations are outside the tracked set.
The observer runs separately so its accounting does not inflate CPU timings.

### Preserve motion while adding synthetic detail cost (07 measurement)

To ask what a denser soldier costs, a test fixture splits existing triangles
into coplanar pieces and adds transform-equivalent, actually referenced joints.
Extra authored times sample the original tracks rather than inventing faster
motion. One- versus four-weight variants keep the skeleton fixed; the shader
already reads four slots, so this changes address locality, not instruction
count. The unbuilt alternative duplicates overlapping faces or adds unused
bones, giving misleading cost. The plan delegated detail allocation but left
the synthetic subject unspecified. **Sound:** unchanged posed surfaces isolate
cost, while genuine anatomy, hierarchy depth and material quality still require
their later authored model gates. These fixtures never enter the gameplay catalog.

### Check pose arithmetic and rendered consumption separately (06c)

When two mathematically equivalent poses differ by a tiny rounding amount, one
pixel at a shoulder or shadow boundary can still pick a different surface. The
test first independently computes the CPU joint transforms and compares them
with the actual GPU transforms under the existing1e-5 bound. It then uses those
validated GPU transforms to pose geometry on the CPU and compares that render
with production within one8-bit color level. The original all-CPU image is still
reported, but is not falsely described as pixel-identical. The alternative was
an exception for one troublesome pixel, which would hide rather than isolate
the cause. The plan required CPU/GPU agreement without defining how numerical
pose tolerance interacts with discontinuous raster/shadow boundaries.
**Sound:** the independent numerical check prevents a circular reference, and
the second check verifies actual rendering. Future fixture changes inherit both
checks, exact temporal continuity, and exact screenshot baselines.

### Give the authored diagnostic test-only action bindings (06c)

The Blender export diagnostic has a gait and a rider motion but no gameplay
action vocabulary. The test clones it, gives the original tracks named roles
for the real controller, and uses the rider track's endpoint as a synthetic
full-body terminal target. Nothing is downloaded, no new animation is claimed,
and the actual catalog remains manual-only. The unbuilt alternative would let
blocky gameplay horses stand in for an articulated horse/rider rig, leaving
mounted composition under-tested. The plan required this diagnostic but did not
specify its test bindings. **Sound:** the isolated aliases exercise the real
controller and renderer without admitting fake death art into gameplay. Future
authored soldiers still need genuine action clips and their own motion review.

### Explicitly retire compute-only storage in the pinned Three version (06b)

The production renderer's joint buffers have no geometry owner to release them.
After retiring every reading material and compute node, the adapter therefore
uses the pinned renderer's attribute cache to dispose storage and balance memory
accounting. A narrow incomplete-allocation branch handles records without a
registered buffer. The alternative leaks buffers or attaches fake geometry solely
to obtain cleanup. The spec did not define this framework boundary. **Sound:**
the dependency is explicit and covered at replacement/failure boundaries, but a
Three upgrade must revalidate it. An opaque GPU handle that fails before the
framework records it is not claimed recoverable through this cache.

### Use a bounded quaternion calculation shared by both GPU renderers (06b)

The GPU blends local rotations along the shortest arc before building the joint
hierarchy. Its angle calculation and small sine polynomial cover only that
bounded rotation problem; they are not a new general math library. Both renderers
use the same implementation. The alternative uses GPU built-ins whose permitted
error can exceed the existing pose gate. The spec delegated encoding and
interpolation details. **Sound:** retain the intended rotation semantics and
unchanged accuracy requirement, with the additional arithmetic cost owned by07.

### Keep capacity growth synchronous and retire complete binding generations (06b)

When the visible crowd or frozen-pose storage outgrows its allocation, the renderer
allocates a checked replacement, installs coherent consumers and retires old
buffers. Three replaces its coupled dynamic buffers together; raw can retain
unchanged allocations. Fresh snapshot storage receives every still-active frozen
source once. The alternative reserves maximum capacity or introduces asynchronous
stale-frame policy. The spec did not prescribe a growth strategy. **Sound:** retain
the existing synchronous API, with slack and temporary replacement memory costs
explicitly left for07 measurement rather than claimed free.

### Ease existing corpse effects with the actual death transition (06c)

Roll, recoloring and contact shading must not jump when the skeleton begins a
continuous death blend. Their shared strength follows that full-body transition
weight, reaching the existing final corpse treatment when the blend finishes.
Manual dead poses without playback retain full strength; initialization and
successful model reload do not promise continuity from an incompatible old pose.
The alternatives remove the effects now or add a separate presentation clock.
The spec required continuous displayed death but left these inherited effects
unaddressed. **Sound:** one controller transition now governs their onset as well
as pose blending. This is a06c implementation obligation, not completed visual
acceptance;13 still judges whether the final corpse styling belongs with the art.

### Keep frozen poses in stable GPU slots until they stop being used (06b)

**Confidence: medium.** An interrupted soldier's saved pose stays in its existing
slot even if a lower-numbered slot becomes free. New poses reuse holes. This
avoids uploading the same pose again just to make the storage look compact.
The slot span can therefore exceed the current live count;07 must measure both
and the high-water capacity. The plan required bounded reuse but did not choose
compaction. **Sound:** visible frozen sources remain bounded without per-frame
movement of retained data.

### Invalidate potentially overwritten slots after an aborted upload (06b)

**Confidence: medium.** A failed frame may already have written a new pose over
an old slot. The next attempt uploads that old pose again if needed, even when
the failure happened before the write actually reached the GPU. Unaffected
slots remain reusable. The plan required failure safety but left partial writes
open. **Sound:** conservative reupload prevents an old identity from referring
to new bytes, without rebuilding every retained snapshot.

### Read a stable indexed worklist instead of copying playback wrappers (06b)

**Confidence: medium.** The packer asks the renderer for each already-decided
pose by index. It does not advance animation history or create a wrapper object
for every soldier. Manual clip inspection uses the same resolved-sample path
without inventing combat history. Callers must keep that worklist stable during
packing. The plan did not prescribe this interface. **Sound:** one sampler
serves both inspection and gameplay;07 still owns the measured CPU cost.

### Admit near-unit rotations instead of repairing malformed ones (06a/b)

**Confidence: medium.** Source keys, bind rotations and loaded local samples
must have quaternion length within0.0001 of one. This tolerates normal exported
rounding but rejects tiny or materially non-unit rotations. Silently normalizing
such inputs would alter authored endpoints. Admission also checks the actual
Float32 representation, so accepted source/JSON cannot cross the limit during
packing. The plan left numerical admission
open. **Sound:** the GPU normalization/bounds proof has an explicit input
domain; future exporters must satisfy it or justify a different contract.

### Preserve source precision and expose immutable transition snapshots (05b)

An interrupted pose retains double-precision local transforms until the shared
sampler composes its Float32 joint matrices. Rounding the locals earlier would
change previously accepted bake bytes. The public saved source uses frozen
ordinary arrays, so a consumer cannot alter or transfer the controller's backing
pose. Copying a mutable typed array on every rendered frame would preserve safety
but repeat that cost throughout a transition.

The plan required bounded saved poses without prescribing storage. **Sound,
medium confidence:** numeric payload is80bytes per joint per active source,
plus array/object overhead and conversion temporaries.07 must measure that real
cost and the eventual GPU packing; this is not an approved final memory budget.

### Distinct diagnostic release motions exercise actual role selection (05b)

A bow release, a throw and a crew release now select different small authored
motions. These are timing fixtures, not accepted final animations. Reusing one
shooting motion for every weapon would hide wrong selection. The plan required
meaningful applicability but left these temporary keyframes open. **Sound, medium
confidence:** the source contract is testable now; later motion slices still owe
the full visual-quality verdict.

### One authored image set per appearance (slice04b)

When one soldier has leather, cloth and metal parts, those parts can use different
regions of the same color image and independently enable its roughness/metalness
or occlusion map. They cannot each supply competing images for the same channel.
The baker rejects that export instead of silently resizing or combining images.
The alternative would require arbitrary per-part textures and more binding or
atlas machinery before the first finished model exists.

The original plan required material maps but did not choose their grouping.
**Sound, medium confidence:** this keeps one appearance drawable as a batch and
preserves the exact authored images. Future Blender authoring must lay out a shared
image set; if a real roster asset cannot fit, revisit this constraint explicitly.

### Prepare distinct image owners sequentially (slice04b)

During reload, each image finishes decoding and GPU admission before the next
starts. If a later image fails, all earlier allocations are already owned and can
be released. A parallel implementation would need to handle images that finish
after the overall reload has already failed.

The plan specified atomic replacement but not scheduling. **Sound, medium
confidence:** predictable cleanup comes before speculative startup concurrency.
The measured asset-budget pass can justify bounded parallel preparation if loading
time warrants its extra ownership machinery.

### Keep correct material transfer before repairing placeholder readability (slice04a)

When the campaign draws the old warm-colored soldiers using correctly decoded light and explicit material properties, some skin and limbs become darker and harder to distinguish. This pass keeps that truthful transfer instead of brightening the renderer to preserve the old accidental result. The future authored surface passes must restore readability through the actual assets; this is not approval of the darker placeholder art.

The plan separates infrastructure from final art but leaves this intermediate visual tradeoff open. **Sound:** making authoring dependable comes first, consistent with the user's infrastructure-first clarification. The reach is the later foot, mounted and crew surface review: those passes inherit a visible readability obligation, not permission to lower the quality target.

### Retain a simpler lighting model in the raw renderer (slice04a)

When the same metal material appears in the campaign's raw renderer and the battle's Three renderer, both now read its authored color, roughness and metallic value. The raw renderer uses its existing smaller lighting model, extended to respond to those values; it does not acquire a second copy of Three's full physically based lighting system. The pictures can therefore differ even when the material data agrees.

The plan permits different raw pixels but did not choose how much lighting machinery to share. **Sound:** this avoids a second full lighting engine while preserving authored channel response. Future raw-renderer work must maintain that response; exact battle/campaign lighting parity would be a separate architectural change.

### Keep far-atlas edge quality provisional while measuring its cost (slice04a)

When a soldier becomes a distant image, the new GPU bake records surface properties rather than a pre-lit picture. Its pixels currently use a single coverage sample, whereas the replaced canvas painter smoothed edges. Thin diagonal equipment may consequently have harder stair steps. The provisional call is to keep this infrastructure representation while the first-pair and roster distance passes compare actual authored silhouettes and decide the coverage budget; it is not a final edge-quality verdict.

The plan delegated atlas packing but left this lost edge smoothing unspecified. **Sound, provisionally:** the representation is measured and reversible, and no unexplained material error may be excused as edge debt. Future distance acceptance must explicitly compare smoothing quality and memory cost, rather than inherit this setting as approved art.

### Retain bake depth storage with its property targets (slice04a)

When an atlas finishes baking, its depth buffer is no longer sampled, but remains owned by the same render target until the atlas is replaced or disposed. Releasing only that attachment early could save about45MiB across the current catalog, but would introduce a separate backend resource-lifetime path. The current choice retains the simpler target ownership and includes its full cost in reported allocation and reload peak.

The plan required measured memory without specifying attachment lifetime. **Sound, provisionally:** ownership is explicit and cleanup is tested. The measured asset-budget pass can revisit the retained storage if it constrains the final roster; the quoted allocation must never omit it merely because shaders do not sample it.

### Material tables are immutable GPU copies for one prepared crowd (slice04a)

When an author changes a material file, reload constructs a new GPU material table and replaces the prepared crowd. Mutating an already-loaded JavaScript array does not update the visible material in place. Tiers that share the same loaded table share its GPU copy; a separately prepared crowd owns separate copies, even for identical bytes, so rejecting a reload cannot free the current crowd's resources.

The plan required reload and shared source ownership but left GPU caching lifetime open. **Sound:** resource sharing stays inside one disposable preparation rather than adding global reference counting. A future live material editor must explicitly upload its edits or use reload; ordinary JavaScript mutation is not an editing API.

### Give temporary geometry explicit surface categories (slice04a)

When building the old diagnostic soldiers, a wooden shaft and a leather body can have the same brown color but receive different material slots. The builder now names those surfaces directly. Its temporary heavy body remains categorized as bronze, while the medium body is leather; these categories describe existing placeholder content, not a reinterpretation of the requested chainmail heavy infantry.

The plan required explicit placeholder identity but did not assign every old primitive a surface. **Sound:** the categories make the transport testable without pretending the old geometry is finished equipment. The first-pair gear and surface passes replace this temporary content with the user's leather-versus-chainmail distinction.

### Benchmark motion uses authored clip duration (slice03)

When the crowd benchmark advances its marching soldiers, it samples the duration declared by their asset using the production phase rule. Keeping the former private shader's rounded clock would measure a different animation path even after sharing the mesh.

The plan required a production-path benchmark but left this timing conversion open. **Sound:** the benchmark now exercises the same sampling behavior as the renderer. The fixed workload and frame-time limit are preserved; this remains a rendering benchmark, not proof of live simulation performance.

### Reject uniformly colored benchmark captures (slice03)

A software-rendered vista once reported healthy soldier counts while its screenshot was effectively one color. The image check now requires a small amount of brightness variation as well as the existing bright-pixel floor. A bright empty canvas no longer counts as visible content.

The plan required readable evidence but did not prescribe this detection. **Sound:** this strengthens the check without replacing visual inspection, the screenshot comparison, or actual workload assertions. The variance threshold is only an empty-frame detector, not an art-quality score.

### Preserve original GLBs beside candidate material metadata (slice03)

When a local Blender export contains a checker texture, the geometry baker records its material slot and keeps the original export beside the candidate. The current scalar material description does not yet reproduce that texture; retaining the source preserves its images, sampling settings and material definitions for04. Discarding them would make a successful geometry import look like a complete surface import when it is not.

The plan separated geometry and material acceptance without specifying this intermediate source provenance. **Sound:** the omission is explicit and recoverable, with no outside service involved. This costs duplicate source bytes in diagnostic bundles;04 should replace this intermediate material reference with the actual rendered texture contract, not leave an unused second material owner.

### Use each appearance's complete near mesh to bake its initial far image (slice03)

When a pikeman becomes a small distant figure, his image is baked from his own complete mesh, so his pike does not become another class's sword. The initial placeholder bundle references its near mesh for that bake rather than storing an identical extra file or using one generic soldier image. Each appearance therefore allocates its own small image atlas, a grid of views used at distance.

The plan required appearance-specific far content but did not choose its first producer. **Sound:** this preserves equipment identity while the later distance-representation slices own authored reductions and final readability. It increases atlas memory and draw groups; performance must be measured with those real groups, not the former shared image.

### Isolate soldiers by removing foliage occlusion (slice01)

When reviewing a hand grip or a foot, randomly placed grass and rocks can cover the part being judged. The workbench hides those objects but retains production ground, lighting, shadows and post-processing. A fully dressed battlefield would provide more context but less reliable close inspection; later production formation/battle gates still require that context.

The plan required production parity but did not specify review scenery. This choice constrains the workbench to asset inspection, not environment acceptance. **Sound:** it removes an occluder without changing how soldiers are shaded. Revisit if a future gate depends on soldier–foliage contact.

## Sound — high confidence

### Stop allocating timing queries when timing collection fails (06b)

The renderer normally collects both GPU timing pools after a frame, while the
standing metric still reports render work alone. If the timing API propagates a
failure, it disables further timing-query allocation and publishes no timing value. A late
successful readback cannot restore a stale number after that terminal failure.
Rendering itself continues. The alternative stops reading but keeps allocating
queries until the pool fills, while displaying an old measurement indefinitely.

The plan required reliable performance evidence but did not specify this failure
policy. **Sound, high confidence:** this completes the existing terminal timing
failure behavior without retries or a new renderer state machine. A fresh world
can initialize timing again; frame-correlated compute-inclusive budgeting remains
the separate measurement work in07.

This policy cannot detect errors that Three catches internally and replaces with
its previous timing value. Those errors are logged by Three and fail the browser
runner; they are not claimed to clear live stats through the public promise.
Future measurement must distinguish fresh samples from retained values rather
than interpreting every successful API resolution as a new measurement.

### Suppress a partially uploaded crowd until a complete upload succeeds (06b)

An upload can fail after an earlier skeleton group has already queued new data.
The caller receives the original error, and subsequent rendering submits no
partial crowd until a whole upload succeeds. This differs from catalog reload,
whose separately prepared candidate can still be rejected while retaining the
last working scene. The unbuilt alternative preserves every old live generation
to roll back individual frames. The spec required explicit failure handling but
did not select that policy. **Sound:** avoid silently drawing inconsistent poses
without adding an unrequested rollback system.

### The preview clock wraps loops; explicit phase1 remains the endpoint (06b)

A manual or frozen request for phase1 displays the last authored sample, even for
a looping clip. An advancing preview wraps its clock before submitting a phase.
The alternative makes the renderer guess whether the same phase means an endpoint
inspection or continuing playback. The spec left that manual-loop boundary open.
**Sound:** one source resolver interprets samples; the caller owns time. Removing
raw override options eliminates a second, conflicting clock policy.

### Rider action admission checks the joints the action actually controls (05b)

A moving horse leg cannot make a motionless rider action qualify as animated.
The source check samples local transforms within the declared rider mask, so
inherited movement from a parent also cannot qualify. Checking all world matrices
would accept movement discarded by playback. The plan required no-op rejection
without specifying this check. **Sound:** admission follows the same local-motion
ownership as the bounded rider override, without adding another animation graph.

### Generate the applicability review matrix from the asset owner (05b)

Changing a source binding regenerates its review row beside the catalog. The
determinism check detects stale review data; the matrix links to the existing spec
acceptance checklist and stores no separate progress state. The plan requested a
matrix but did not specify its owner. **Sound:** review and runtime cannot acquire
independent hand-maintained rosters.

### Isolate source transfer from unrelated presentation policies (slice04d)

When the six material strips switch between the stock loader and production,
they remain above ground-contact darkening, have no faction marking, and show
front-facing surfaces in the same world. Otherwise the pair could differ because
one renderer applies those presentation policies differently, even though the
authored material arrived correctly. Independent controls still test those
policies and posed/backface behavior; this fixture does not replace them.

The plan required matched swatches but did not specify this isolation. **Sound,
high confidence:** it gives the material comparison one interpretable variable.
Future reviews must not treat these strips as proof of grounded silhouettes,
faction behavior or stock/custom backface equivalence.

### Bound cross-renderer arithmetic without weakening regression snapshots (slice04d)

When the stock loader and weighted production path draw the same strip, small
arithmetic and image-path quantization differences can change a channel by one
or two RGB codes. The paired check bounds the whole-world difference and also
checks each material's interior; map-disabled controls prevent unchanged
backgrounds from hiding missing material response. A later run of the same
production snapshot must still match exactly.

The plan required comparison but left its numerical criterion unspecified.
**Sound, high confidence:** a measured cross-renderer allowance is distinct from
permitting regression drift. Future fixture changes must preserve that distinction,
not raise the bound to hide a new transfer defect.

### Admit mapped frames while computing existing animated bounds (slice04c)

When an appearance is baked, its material slots now accompany the existing
animated-bounds calculation. Each pose that calculation already visits also checks
that normal-mapped vertices have usable surface directions. Callers cannot omit
the material list and silently skip that check. Loading checks the starting mesh;
it does not repeat a full animation scan in the browser.

The plan required valid posed directions but left the validation API open.
**Sound, high confidence:** one traversal and a required input enforce the rule
without a second scan or an optional bypass. Future bounds callers must supply
the appearance's actual material slots.

### Preserve the existing deformation rule and define its collapsed limit (slice04c)

When several bones bend a surface, its normal and tangent use the same weighted
direction transform already used by the renderer. This does not introduce a new
inverse-transpose normal convention that would relight all existing assets. If
interpolation nearly cancels otherwise valid directions, shading uses the
geometric surface direction instead of amplifying numerical noise. Invalid
normal-mapped source frames still reject; this fallback does not admit bad assets.

The original material requirement did not choose a deformation convention or its
degenerate limit. **Sound, high confidence:** this isolates the requested map
support and keeps ordinary untextured rendering stable. Future rig changes inherit
that convention and must explicitly revisit it if they need different scaling.

### Reject normal scales that cannot survive GPU packing (slice04c)

An authored scale can be a finite JavaScript number yet become infinity in the
GPU's smaller number format. The baker and loader now reject that value rather
than letting it turn a surface's lighting invalid. Large values that do fit remain
supported through bounded normalization; zero still scales only the map's X/Y
components, not its Z direction.

The plan required authored scale but left its numeric storage limit implicit.
**Sound, high confidence:** explicit rejection preserves the actual rendering
contract without silently clamping author data. Future material editors inherit
the same Float32 boundary.

### Exercise collapsed poses by modifying a real export in memory (slice04c)

The source regression opens an existing Blender export and changes only its test
weights and bone rotation to cancel a mapped direction. Its starting mesh is valid,
so a rejection proves the animation check ran. The alternative was another
checked-in art fixture or a fake importer result.

The plan left this failure fixture unspecified. **Sound, high confidence:** the
test exercises the actual byte importer and baker without adding another source
asset to maintain. The ordinary exported fixtures remain unchanged.

### Closing a world makes pending reloads terminal (slice04b)

If an author closes a world while a replacement is loading, that replacement
cannot become the new visible crowd after teardown. Completed preparation is
released, and another reload on the closed owner fails before fetching. Calling
dispose twice is harmless. The alternative would silently claim a successful
reload into an owner that no longer has a usable renderer.

The plan required atomic reload but did not define teardown races. **Sound, high
confidence:** the original owner remains closed, without a generic cancellation
manager or a hidden world-recreation path.

The06b consumer retains this rule inside preparation as well: after an asynchronous
wait, it checks the same world's existing closed state before starting more GPU
work. Already acquired resources are registered before that check so cleanup owns
them. This is one borrowed-lifetime assertion, not a second cancellation state;
an error in a still-open world keeps its original cause.

### A complete surface owns its GPU resources (slice04b)

Two appearances may have identical scalar colors but different image maps. Sharing
only by their color table would give one appearance the other's texture. Loaded
surface identity therefore groups the material table, images and sampling settings.
Near meshes and their far-image bake share that prepared owner; an independent
crowd gets independent disposable resources, extending the existing reload lifetime
decision without global reference counting.

The original plan did not define image-cache ownership. **Sound, high confidence:**
closing or rejecting a replacement cannot destroy the visible crowd's images.
Three's external texture wrapper borrows the GPU image; the preparation owner
explicitly destroys it rather than relying on wrapper disposal.

### Omitted source samplers follow the standard loader (slice04b)

If a Blender export omits optional filtering settings, the baker uses the installed
standard glTF loader's linear filtering and mipmap policy. Explicit settings remain
unchanged, including the diagnostic checker's nearest filtering. Choosing unrelated
defaults would make an otherwise identical source look different between its
reference loader and production.

The plan required declared sampling fidelity but left absent settings open.
**Sound, high confidence:** reference and production interpret the same omission
consistently; future loader upgrades must preserve or deliberately review that rule.

### Embedded image packaging does not change image identity (slice04b)

A local export can put a PNG in its binary chunk or encode the same bytes as
base64 text inside its JSON. The baker accepts both and emits the exact image bytes;
external file and network image references still reject. Rejecting the second
container would add a packaging restriction without protecting visual fidelity.

The plan named embedded images without choosing their container. **Sound, high
confidence:** the accepted packaging does not introduce external asset I/O or a
second image source.

### Browser decoding is the image-codec authority (slice04b)

The baker checks image declarations, signatures and byte ranges, then retains the
encoded bytes. The browser decodes them when preparing the GPU surface. A corrupt
image body rejects that preparation and keeps the previous scene usable. Adding a
second full decoder to the baker would duplicate a dependency and still would not
prove that the target browser can decode the image.

The plan required malformed images to fail but did not choose the decoding owner.
**Sound, high confidence:** load-time decoding remains part of atomic admission,
not an assumption that every correctly labeled byte array is renderable.

### Neutral raw bindings mean absent maps, never failed maps (slice04b)

An untextured soldier still uses the raw renderer's fixed binding layout. Small
neutral images fill absent channels, while explicit per-slot flags decide whether
a map contributes. A declared image that fails never receives this substitute.
The alternative would compile separate pipeline layouts or split draws for each
combination of maps.

The plan prohibited extra material draws but left absent-resource binding open.
**Sound, high confidence:** neutral bindings simplify batching without hiding
broken authoring or inferring material meaning from colors.

### Missing source faction attributes mean unmarked geometry (slice04b source transport)

When an ordinary Blender export contains no `_FACTION_MASK` custom vertex attribute,
its geometry receives no faction tint. If the attribute exists, its scalar values
must be finite and between zero and one; broken references and other encodings
reject rather than becoming zeros. An author who wants markings must enable
Blender's Attributes export option and name the attribute exactly.

The plan required independent faction masks but did not define their source
convention or absence. **Sound:** ordinary unmarked geometry remains valid, while
present markings have a strict tested contract and are never inferred from color.
Future authoring must check the exported mask when markings are intended; omission
is not evidence that the exporter preserved the intended markings.

### Measure roads and sea-lane strips separately in full-game verification (04 maintenance)

When the full-game check opens the campaign, roads are triangle meshes while its
line counter covers sea-lane strips. The check now requires a substantial road
triangle workload and nonzero sea-lane lines. It no longer asks sea lanes to exceed
the old road-line count. The starting revision fails that same old assertion with
identical map data and geometry, so lowering a timing limit would not address it.

The plan required standing checks without identifying this carried-in mismatch.
**Sound:** the assertion follows the actual workload owners and retains the
existing city, depth and timing validity checks. Future verification must not use
one drawing primitive's counter as evidence for a different primitive.

### Validate gameplay clips at controller admission, not generic import (slice03)

When the battle reloads an asset that can stand idle but has no attack clip, it rejects the replacement before a later attack can crash rendering. The required names live beside the controller that requests them. A diagnostic with only an elbow-bend clip is still valid: its workbench explicitly requests no gameplay vocabulary and selects the asset's own clips.

The plan required meaningful clips and candidate inspection without defining this admission boundary. **Sound:** one generic loader can serve both uses without fake clips or fallback animation. Assets are checked before GPU allocation on startup and before replacing the current crowd on reload. Slice05 owns the later role-specific vocabulary; this check represents the current controller only.

### Keep the retained crowd benchmark at full detail (slice03)

When the old prototype switches to the production crowd implementation, it still submits every benchmark soldier at full detail. Applying normal battle distance reduction there would shrink the workload and make an apparent speed improvement incomparable to the old 33 ms gate.

The plan required preserving the existing performance gate but left the shared-renderer submission seam open. **Sound:** the benchmark keeps its original cost, while actual battles retain their ordinary visibility and distance policy.

### Keep candidate selection owned by the production world (slice03)

When the workbench opens a locally baked diagnostic catalog, the production world remembers that catalog's address. Reload reads the same address instead of accidentally replacing the diagnostic with the gameplay roster. The workbench supplies a selection, not a separate loader or rendering path.

The plan required candidate reload without specifying who retains its source. **Sound:** the same owner creates and replaces GPU content, so future reload behavior cannot diverge between inspection and battle. The default gameplay catalog remains unchanged.

### Match fixture framing with an explicit camera target (slice03)

When comparing a mounted fixture to its export reference, the camera aims at the fixture's recorded center rather than a hard-coded human chest height. That target travels with the inspection pose. Ordinary soldier review keeps its existing default target; the renderer's lighting and projection are not redesigned to flatter the candidate.

The plan required matched framing but did not specify this input. **Sound:** the reference and production view can show the same geometry at the same framing, including non-human diagnostic dimensions.

### Hold zero-duration diagnostic clips still (slice03)

When a source fixture contains a single static pose, pressing play leaves it at phase zero rather than dividing elapsed time by a zero duration. Animated clips advance by their authored duration and use their declared loop behavior.

The plan required source timing but did not define static-clip playback. **Sound:** static poses remain valid inspection assets without invented motion or a special replacement clip.

### Match exported tiers by bone names and actual bind transforms (slice03)

A Blender export can number the same arm bones differently in its near and reduced meshes. The baker matches uniquely named bones, checks their parent relationships and resting transforms, and rewrites each vertex's joint references into the near tier's order. It accepts reordered exports but rejects a genuinely different rig, rather than bending the reduced soldier with unrelated joints.

The plan required a shared skeleton without prescribing tier matching. **Sound:** authoring can change export order without changing deformation, while one animation set remains authoritative for all three tiers. Reduced tiers must retain the compatible skeleton; they cannot silently substitute a different rig.

### Changing the selected appearance chooses an applicable clip (slice03)

If the reviewer switches from one appearance to another and the current clip exists on both, the workbench keeps the clip and phase. If it does not, the picker selects the new appearance's first declared clip at its start. Programmatic requests for a missing clip and incompatible reloads still fail explicitly.

The plan required role-appropriate clips but did not define picker behavior. **Sound:** a deliberate selection change remains usable without inventing a missing animation or weakening asset-load failures. This is only a UI default, not a runtime fallback.

### Keep four-weight geometry in one shared upload layout (slice03)

When a vertex bends between an upper arm and forearm, its mesh retains each contributing joint and weight. Both renderers pack those attributes through the same layout immediately before GPU upload; the canonical asset keeps separate typed arrays for baking and CPU inspection. Giving every attribute its own GPU buffer exceeded the baseline device limit when shadows and instance data were added. Dropping weights would fit but would break the intended smooth bends.

The plan delegated buffer packing; the load-bearing ownership choice is that both substrates share its single definition. **Sound:** it preserves the full deformation data and existing device requirements. Future material channels must extend this owner rather than create a renderer-local encoding. Exact packing sizes remain implementation discretion and are measured by the performance gates.

### Fixed export fixtures are loaded once per review session (slice02)

When the reviewer switches quickly between the human and mounted diagnostic, the selected object changes immediately. Both original assets are loaded once at startup and remain owned by this small oracle until the page closes. The alternative refetched each selection, allowing overlapping responses to leave two fixtures visible and repeatedly allocate textures.

The plan required an independent export oracle but did not prescribe fixture loading lifetime. **Sound:** a fixed, bounded pair needs selection, not a general asynchronous asset-replacement system. Production authoring reload remains the separate workbench's responsibility. This constrains only the diagnostic route, not the roster loader.

### Compare mapped surface vertices, not only joint locations (slice02)

An exported elbow can have correctly placed bones but incorrectly weighted skin. Blender therefore records evaluated surface positions, and the exporter maps each glTF vertex back to its source vertex even when UV seams split it into multiple copies. The browser compares every mapped surface point. A joint-only check would miss lost weights or incorrect mesh bind transforms.

The plan named geometry landmarks but left their encoding open. **Sound:** the original fixture is the independent answer, not the custom crowd baker being tested. Generated landmark files are deliberately verbose, and remain reproducible test data rather than hand-maintained geometry inventories.

### Diagnostic fixtures use neutral surfaces and one checker patch (slice02)

When examining the elbow bend, all-over high-frequency checks concealed the surface. Plain rough grey now reveals the shape; the shield alone retains the authored checker for UV inspection. This changes neither deformation nor final soldier art. The alternative would preserve texture noise that made the export check harder to judge.

The plan excluded final material styling but left diagnostic presentation open. **Sound:** source surfaces stay inspectable, and material fidelity is still a later gate. Neutral color, roughness, checker resolution and exact fixture joint counts are reversible diagnostic settings, not a lower quality bar for the roster.

### Failed reloads retain the last working scene (slice01)

After a local bake, the author can press reload. If its files are broken or omit the selected appearance/clip, the workbench shows the error and keeps the previous soldier usable. A successfully loaded replacement is installed as a whole. The unbuilt alternative would blank or break the inspection view while the author corrects the export.

The plan requested visible errors but did not specify replacement failure behavior. Future import work must retain this explicit last-good behavior, including disposing partially allocated GPU resources. **Sound:** an error stays visible without destroying the review session; this is not a hidden placeholder fallback.

### Restore dependencies already recorded in the lockfile (slice01)

A clean install failed because the package manifest omitted the Node and PNG type packages already present in its lockfile. The manifest now requests those same versions. No package upgrade or new dependency choice was made. Leaving the mismatch would make the new worktree impossible to verify with a frozen install.

The plan did not address an inconsistent starting manifest. Future builds can use the existing frozen lockfile. **Sound:** source and lockfile now describe the same installation rather than requiring an undocumented local workaround.

### Render probes honor the renderer's browser-frame boundary (slice01)

When a test submits a second pose in the same browser frame, three.js's post-processing scene can still contain the first pose: that scene is updated once per frame. The parity test waits until the workbench has no pending draw, then submits each compared pose in a new browser frame. It still requires identical pixels; it does not retry until a lucky image matches.

The plan required deterministic parity but left its scheduling unspecified. Other manual render probes must respect the same frame boundary. **Sound:** synchronization follows the renderer's actual update contract rather than increasing a screenshot tolerance or arbitrary delay.

### One production owner for zero-copy battle views (05a, `f36211df`)

**Confidence: medium.** When reinforcements append soldiers or WASM memory grows, the next health read must use the current memory buffer, pointer and soldier count. The existing position, facing and unit-info reads followed this rule inside world creation. The pass extracts those closures into `createBattleViews` and adds injury views there; world creation composes that same factory. An alternative would leave the closures embedded and require renderer/UI setup to test memory behavior, or create a separate test-only copy that could drift.

The plan required minimal zero-copy observations but did not choose the view module boundary. Future observation channels inherit this one owner and its real-WASM lifecycle tests, not a cache or a second memory adapter. **Sound:** extraction isolates the existing memory-view responsibility while preserving its public methods and behavior. It introduces no injury history, action policy or permission to write simulation memory from presentation code.

### One battle observation adapter, separate from action policy (05c)

**Confidence: medium.** When a soldier switches from pike to sword, production and the battle lab now read the same equipped-weapon state and choose the same catalog appearance. A shared adapter reads WASM and measures motion; the action controller decides which action runs. The unbuilt alternative leaves the lab with its own frame/weapon policy, so a successful lab test can disagree with battle.

The plan named the production adapter but did not settle how to eliminate the lab duplicate. Future observation fields belong to that shared boundary, while timing remains outside it. The existing class/weapon schema moves beside class data rather than remaining owned by the renderer. **Sound:** this gives each decision one owner without adding a second health cache or changing combat.

### Reloading models starts fresh visual history (05c)

**Confidence: medium.** If an author reloads a model while a soldier is midway through an action, the accepted catalog replacement starts a new visual action entry from current observations, including already-dead soldiers. It does not carry an old skeleton's partially blended pose into a new skeleton. A failed reload keeps the previous catalog and history. The unbuilt alternative attempts to preserve progress across potentially incompatible joint layouts.

The plan required safe reload but did not choose cross-rig history behavior. Future hot-reload work inherits this deliberate loss of visual progress, not a promise of seamless action continuity while authoring. **Sound:** preventing incompatible pose reuse is more important than retaining authoring-session phase; gameplay state is untouched.

### Reach overlays report engagement, not fabricated strike beats (05c)

**Confidence: medium.** While a living soldier is engaged, the tactical reach overlay now shows that weapon's reach envelope within its existing visibility budget. Previously a numeric-frame rhythm made it blink as if particular strike moments were known. The unbuilt alternatives keep that invented rhythm or remove the overlay entirely.

The plan removed fabricated action events but did not specify this diagnostic overlay. Future animation/contact work must not interpret the overlay as evidence of an actual hit. **Sound:** it retains useful spatial information while disclosing the less-specific observation. Likewise, switch cooldown no longer forces an idle pose: current equipment and genuine actions remain visible until authored switching/attachment continuity is implemented in slice14.

### Frozen rendering caches observations, not just the camera (05c)

**Confidence: high.** Advancing a frozen battle by three ticks can change a soldier's pose without moving the camera. The renderer therefore includes the observation tick and accepted catalog identity in its reuse decision. Repeating the same request can still reuse the submitted frame; a same-tick reload cannot. A thin debug reload call reaches the existing owner so the production path can be tested.

The plan did not account for the inherited cache's missing inputs. Future pose changes made outside normal tick/catalog updates must provide an explicit invalidation signal; they cannot rely on a new array allocation to defeat caching. **Sound:** the cache follows actual state ownership without removing frozen reuse or weakening performance gates.

### Recover release age from the existing simulation countdown (05c)

**Confidence: high.** If a projectile's countdown is first observed partway through, the adapter subtracts its remaining time from the simulation's own duration and reports elapsed release age. The controller can advance beyond its authored release marker rather than pretending emission happened just now. The unbuilt alternative duplicates the duration in JavaScript or requires a new event log.

The plan required release-compatible playback but did not define delayed-observation age transport. The read-only duration accessor is backed by the very constant used when missiles emit, and remaining TTL is still supplied for refresh detection. **Sound:** this supplies the information the current consumer needs without a second clock constant, event counter, or combat change.

### Admit gameplay only when local and baked clip timing agree (05c)

**Confidence: high.** A loaded model can contain a baked GPU clip and a local-joint clip with the same name but different duration. Rendering the former while freezing a blend source from the latter would produce inconsistent poses. Gameplay admission now rejects missing or mismatched required clip names, durations, looping and release markers before installing GPU resources. Manual-only inspection remains available.

The earlier loader validated catalog bindings against GPU clips but did not need local clips for interrupted blends. Future exporters must keep these two representations aligned; the runtime does not guess or silently fall back. **Sound:** the newly active local-pose consumer makes this a concrete admission requirement, not speculative validation.

### Replay is an explicit authoring mode in the existing inspector (05c)

**Confidence: medium.** Opening the ordinary model inspector still shows the same
manual controls. Opening its linked replay URL reveals a repeatable sequence of
synthetic movement, release, injury, equipment and death observations. Those
inputs drive the real action controller and instance submission path, but are
not presented as a recorded fight. The unbuilt alternatives add controls to every
manual visit or build a second viewer whose success could disagree with battle.

The plan required a replay surface but did not choose entry or fixture capture.
The URL is linked from the owning evidence; reduced discoverability is the cost
of preserving the ordinary inspector. Future cases extend the input fixture,
not action policy. **Sound:** one renderer and clearly labeled synthetic inputs
make timing repeatable without claiming exact combat events or GPU blend proof.

### Explicit manual edits end replay, while camera edits preserve it (05c)

**Confidence: medium.** An author can orbit the model during replay without
losing the current action. Choosing a different manual appearance, clip, phase
or formation instead returns control to manual inspection. A successful asset
reload resets replay if the selected appearance still supports it; a valid
manual-only asset exits replay rather than turning that successful reload into
an error. A failed reload retains the last good model and replay history.

The plan did not define the interaction between manual controls and synthetic
history. Keeping both active would leave two competing explanations for the
displayed pose. Future inspection controls inherit one active pose owner.
**Sound:** explicit mode changes prevent stale or misleading state while camera
adjustments remain non-destructive to an author's timing inspection.

### Bound every possible local pose rather than only sampled frames (06 prerequisite)

**Confidence: medium.** A long weapon can swing outside the box containing its
start and end poses. The source baker now follows the skeleton hierarchy and
bounds all allowed translations, scales and rotations, including crossfades and
mounted masks. It uses a sphere centered on the root-translation envelope, not
an optimally tight sphere fitted to a few poses. The unbuilt sampled alternative
can make the renderer wrongly remove a visible weapon near the screen edge.

The plan required conservative continuous bounds but did not choose the method.
Larger diagnostic spheres can retain more off-screen work;07 must measure that
cost. The review camera keeps its own fixed framing rather than moving when a
culling sphere changes. **Sound:** the hierarchy proof covers unseen intermediate
poses without a guessed safety multiplier. Its current Float32 margin does not
pre-approve a different GPU quaternion implementation.

### Reject projective inverse binds instead of silently treating them as affine (06 prerequisite)

**Confidence: medium.** The bounds proof assumes a skeleton transform preserves
the usual homogeneous coordinate. An imported inverse-bind matrix with a small
projective term can pass the importer's approximate shape check yet violate that
assumption, especially far from the origin. The bounds owner rejects that matrix
instead of dropping the term or returning a misleading sphere.

The plan did not define this admission edge. Current Blender exports satisfy the
exact affine row; a future exporter with numerical noise must correct its source
or justify an explicit normalization policy. **Sound:** rejecting unsupported
transforms preserves geometry rather than silently changing authored data to make
the bound appear valid.

### Remove repeated LOD work without lending mutable results (07 source-cost pass)

**Confidence: high.** On each frame the renderer asks which mesh each body needs.
This pass reuses the two private arrays remembering yesterday's choices, but the
answer returned by the planner still belongs to that call. A caller can keep an
old answer without tomorrow's frame rewriting it. The unbuilt alternative would
pool every answer and require callers to understand that borrowed lifetime.

The task allowed allocation reduction but did not require a new storage API.
Keeping returned answers independent avoids introducing that contract before a
matched measurement establishes its value. History arrays are overwritten only
after all old history has been read, and shortened on empty or smaller uploads;
no vanished body's detail choice survives regrowth. **Sound:** ownership remains
simple while repeated arithmetic and temporary history/threshold arrays are
removed. Remaining per-body allocations are explicit; this does not establish
that garbage collection or the interruption cadence gate is fixed.

### Split exact frozen poses across two GPU buffers (07 allocation correction)

**Confidence: medium.** When mounted soldiers interrupt both their movement and
upper-body actions, each can retain two exact starting poses. The measured
30,000-body case needs more storage than one GPU buffer binding permits, even
though the final joint-matrix output fits. The current renderer temporarily hides
the crowd when it cannot submit that frame.

The correction being implemented keeps pose values and their existing logical
slot numbers unchanged, but stores even slots in one buffer and odd slots in
another. A buffer binding is the portion of GPU memory a shader can access through
one input. Each input then needs no more pose slots than the retained capacity
of the output. The same shader reads both; this is not a second renderer or an
approximation of nearby animation poses. Growth, retirement and replacement must
account for both buffers together.

The plan required bounded exact storage but did not choose its physical layout.
Requesting a larger device limit would exclude devices that only support the
measured limit; shrinking rigs or dropping poses would change the requested art
or animation. **Sound, pending implementation verification:** splitting physical
storage addresses the demonstrated per-binding limit without either compromise.
Future palette consumers inherit one additional storage binding and two-buffer
lifecycle accounting. This does not guarantee enough total memory, and passing
the corrected workload will not by itself settle the whole art budget.

### Transfer garment weights from a body surface, not a single vertex (09)

**Sound; confidence: medium; provisional.** When a shirt vertex moves slightly
during fitting, copying the closest body vertex can suddenly select a different
bone mixture. The shirt now finds the nearest body triangle and blends its three
corners' bone weights according to the contact point, then keeps four normalized
influences. This makes nearby points on that triangle share a continuous field.

The plan delegated garment attachment but did not prescribe transfer. This is
an offline Blender authoring choice; the renderer still consumes the same skin
format. It does not solve loose cloth between thighs, where the nearest body
surface itself can change. Future walking and bending reviews must inspect that
case; a dedicated authored garment weight field remains available if evidence
requires it. No runtime cloth system or new simulation authority is introduced.

### Keep pronation on the existing forearm and scope exported actions to its rig (08)

**Sound; confidence: medium; provisional.** When the soldier rolls a sword in his
hand, rotating only the hand twists the wrist while some nearby skin follows the
forearm instead. The fitting study rotates the forearm along its own length and
leaves the hand's local rotation alone. An existing elbow-support bone receives
half the roll. This avoids adding another bone solely to cure that measured
attachment drift; it does not establish that the present wrist shape is good.

The plan left the exact skeleton and authoring recipe open. This recipe constrains
the first ready/walk authoring, but more demanding motion may justify later joint
changes. The original bend remains separate. Blender's muted animation tracks
associate the inspection clips with this rig so exporting them does not pull in
unrelated actions from other scenes or duplicate the active clip. Future clips
must keep that ownership rather than broadcast all actions to every armature.

### Develop candidate materials and motion before final geometry acceptance (09–11)

**Sound; confidence: high.** At this maintenance checkpoint, an unfinished helmet
could prevent even trying mail materials or a walking soldier. That ordered work
by final approval rather than by what an artist actually needs to proceed. The
plan now allows a material or walk candidate on a named, fixed geometry and rig
revision. A later shoulder or hand correction requires the affected material
mapping and animation to be fitted and checked again.

The original plan specified final dependencies but over-constrained editable
candidate work. The revised order preserves every final acceptance dependency,
matched neutral-clay evidence, performance limit and complete-bundle promotion
rule. It enables parallel local art work without calling rough geometry accepted
or using texture and movement to conceal defects. No runtime schema changes.

### Preserve local hand detail rather than enforce the provisional whole-body count (08)

**Sound; confidence: medium; provisional.** In the hand authoring pass integrated
through54860ea2, a fingertip and a broad torso originally underwent the same
smoothing and mesh reduction. The process could erase fingertip pads while still
producing a technically valid body. The authoring script now excludes distal
hands from that relaxation and protects their vertices against collapse, adding
their geometry to the provisional body allowance. Keeping the same total count
instead would force that detail to consume geometry elsewhere on the body.

The plan delegated topology but did not prescribe allocation. This is reversible
source-authoring policy, not an accepted20,504-triangle budget. It preserves a
visible feature for subsequent retopology and distance work; the current heavy
equipment must be refitted to that surface and cannot be promoted until the
measured budget and quality gates pass.

### Supplement whole-body review with a native hand-detail camera (08)

**Sound; confidence: high.** When the fingers occupy only a few pixels in the
whole-body sheet, an apparently held sword can actually run through the palm.
The existing fixture now also captures the right hand closer up, using the same
production renderer, while retaining every original body/head camera. Its
body-occluded side view is not counted as evidence of grip quality.

The plan required credible grips but did not specify this detail framing.
Future candidates inherit an extra deterministic sheet, not a separate renderer
or promise of that gameplay zoom. A posed hand needs its moved position checked;
the fixed neutral target cannot silently stand in for every future animation.

### Supplement whole-body review with a native head-detail camera (08)

**Sound; confidence: high.** A whole-body image can show sound proportions while
the mouth occupies too few pixels to judge. The anatomy fixture now also moves
its existing production camera closer to the head and captures the same four
bearings in the neutral pose. It keeps the original whole-body and gameplay
images, lighting, materials and skinning. Enlarging an old crop would only enlarge
its existing pixels; this additional capture exposes actual facial geometry.

The plan requires facial form but does not specify a dedicated head camera.
Future anatomy reviews inherit one extra deterministic sheet, not a separate
renderer or a new gameplay zoom promise. Passing this detail view cannot replace
the full-body, deformation or gameplay-scale requirements. No baseline is
accepted merely because the new camera creates its first image.

### Share one provisional texture sheet across heavy material regions (10)

**Sound, provisional; confidence: medium.** When the heavy soldier loads, skin,
cloth, mail and equipment read different areas of the same texture sheet rather
than each loading a full-size image. Three 2048-square images carry color, surface
direction and roughness/metal response. The existing material contract still
distinguishes each region; the sheet does not make leather behave like bronze.

The plan required locally authored surfaces but did not choose their packing or
resolution. This keeps the study self-contained and avoids separate image sets
per small piece. It is not a measured memory allowance: slice07 and distance
review can require a different packing or resolution before promotion. Changing
this source policy rebuilds the images and UV coordinates together without a
runtime schema change.

### Bake mail relief into the existing atlas, not runtime ring meshes (10)

**Sound, provisional; confidence: medium.** When the camera approaches a mail
shirt, the surface should show rounded metal wire and dark openings. Blender now
bakes a repeating arrangement of actual tilted rings into the existing texture
atlas: its maps describe surface direction, metal coverage and local occlusion.
The runtime still draws the weighted shirt surface, not thousands of individual
ring meshes. The alternative would increase garment geometry and deformation
cost instead of storing the small-scale detail in material maps.

The material task delegates motif styling but leaves the relief-generation method
open. This keeps one production material path and a fixed-geometry comparison.
Area filtering averages subpixel wire coverage before storage, so distant detail
does not depend on whether one tiny wire happened to land on a sample. The saved
Blender tile remains editable. Resolution and close-detail quality are provisional;
this does not establish a measured texture budget or fully resolved interwoven
links. Future body/garment changes rebuild the maps through this author rather
than importing the material lane's frozen soldier geometry.

### Inspect ready footwear through an additional native close camera (09–11)

**Sound; confidence: high.** A strap may look attached in a whole-body image
while ending inside the heel. The combined candidate retains its original
cameras and adds a close view of both planted feet from four directions. This
exposes sole thickness and strap contact directly, rather than treating the
numerical sole-floor check as proof that the entire sandal fits.

The plan required credible footwear and planted motion but did not prescribe
this framing. It is an extra review view, not a new gameplay zoom or renderer.
Its standing pose cannot establish clearance throughout a walk; moving frames
remain separately required.

### Use distinct authored walk and run rhythms for the heavy candidate (11)

**Sound, provisional; confidence: medium.** When a heavy soldier walks, the
candidate takes 0.765-metre steps over a 0.9-second two-step cycle. Running uses
a shorter 0.8-second cycle with brief periods when neither foot touches ground.
The animations leave horizontal movement to the game; their backward foot travel
is designed around the existing prescribed pace, not a new simulation speed.
Simply accelerating the walking clip would retain walking's support pattern and
would not create a visibly distinct run.

The plan required individual walk/run motion but left rhythm and support timing
to authoring. This first rhythm is a reversible working choice, not accepted
motion: upright carriage, weak push-off and small between-key contact errors
still require correction. Future changes must keep the actual movement consumer's
pace relationship and be reviewed at real playback speed, rather than preserve
these timings merely because they were captured once. No simulation or runtime
schema change is implied.

### Fit sandal straps from the frozen foot surface during baking (09)

**Sound; confidence: medium.** When the sandal is rebuilt, short rays start
inside the foot and locate its actual skin. The leather strips are placed just
outside those intersections, with one strip lifted locally over the crossing.
This lets the strip follow the current foot rather than assuming an oval foot
cross-section. It is an offline modeling operation; gameplay receives the same
ordinary weighted mesh as before.

The footwear task delegated styling and asked for a fit to the fixed body, but
did not prescribe how to find that fit. The implementation reuses the body's
existing surface lookup in the geometry author. A substantially different foot
can move the ray origins outside the skin, so future anatomy changes still
require a deliberate footwear refit and contact review. This does not promise
automatic fitting to arbitrary bodies or introduce runtime collision/IK.

### Refine the face after assigning the body's skin weights (08)

**Sound, provisional; confidence: medium.** Adding eyelid and nose detail should
not change which bones move the untouched hands and torso. The local facial
pass subdivides only front-head triangles after the existing bone weights have
been assigned, interpolates those weights, and projects the new vertices onto
the detailed head before shaping landmarks. Re-running whole-body weight solving
instead could alter unrelated joints. The final editable deformation mesh owns
these details; the hidden sculpt is a construction input, not an identical copy.

The spec requires editable anatomy but leaves topology allocation and operation
order open. This adds provisional face geometry rather than taking detail away
elsewhere merely to hold an unaccepted count. Future body and distance work must
still fit the measured budget; this does not accept the face's quality or count.

### Fit the final shoulder surface before adding garment thickness (09)

**Sound, provisional; confidence: medium.** When Blender rounds the shirt's
sparse construction mesh, the resulting surface can shrink through the shoulder.
The equipment author now fits that rounded shoulder surface just outside the
fixed underlying body, then adds the garment's thickness and transfers the
body's bone influences. Fitting only the original sparse mesh would leave the
later shrinkage unaddressed. The neckline and lower hanging cloth retain their
authored shape instead of being pulled tight to the body everywhere.

The plan requires fitted layers but does not specify this operation order or
the fitting method. The chosen offsets are modeling aids, not a collision
system: raising an arm can still make the layers intersect, particularly where
the nearest underlying surface switches between torso and arm. Future body
changes therefore require a refit and full pose review. This stays an offline
Blender operation and does not add a runtime fitting or cloth mechanism.

### Keep the sheath rigid while its straps follow the waist (09)

**Sound, provisional; confidence: medium.** When the soldier bends or runs, the
leather casing moves with the pelvis instead of bending like a trouser leg. The
top of each suspension strap follows the existing waist deformation; farther
down, its bone influences gradually become those of the pelvis, keeping its end
with the sheath. Giving the whole assembly waist weights would bend the casing;
giving everything pelvis weights could pull its loops away from the belt.

The equipment requirement specifies believable attachment but leaves this
deformation ownership open. This uses ordinary authored skin weights, not a new
bone, cloth simulation or runtime constraint. It deliberately does not add
independent sheath sway. Future attacks and deeper bends must check both belt and
sheath contacts, and can revise these weights or authored motion if this rigid
carry looks implausible. The current fitting samples are not a universal collision
guarantee or a decision to omit ordinary secondary motion from later work.

### Supplement close model review with two formation pitches (09)

**Sound, provisional; confidence: high.** When reviewing a new garment, a close
portrait can show better details while the repeated soldiers still look like
smooth mannequins. The existing model scene now also shows its sixteen-soldier
formation at the gameplay tilt and a more side-on tilt, using the same assets,
light and animation. Keeping only close-ups would miss this group impression;
replacing close-ups would hide hand and attachment defects. Both therefore remain.

The plan requires a small formation but leaves its review framing open. These
are fixed authoring views, not a decision about the nearest playable camera or
the accepted performance budget. Later camera-envelope work may refine them;
the formation evidence cannot substitute for that measurement or live battle
acceptance. No alternate rendering path is introduced.

### Apply explicit snapshot selection before candidate rendering (01)

**Sound; confidence: high.** When an author requests only a hand-detail sheet,
the candidate harness now renders and checks that sheet without first rendering
every walk/run frame. The same existing comma-separated name selection controls
scene admission and pixel comparison. Running without a filter still renders
and checks the complete scene. An explicitly filtered run is therefore focused
evidence, never evidence that the full model gate passed.

The workbench plan requires repeatable iteration but leaves capture scheduling
open. Keeping all rendering before the filter wastes minutes on unrelated poses;
introducing a second quick harness would duplicate the rendering setup. Moving
the shared selection earlier keeps one path and makes focused iteration practical.
Future full acceptance must continue to use an unfiltered run.

### Replace hands locally without re-solving the whole body's weights (08)

**Sound, provisional; confidence: medium.** When rebuilding a grip, only the new
hand surface is combined and simplified. It is joined to the existing wrist edge
and inherits nearby bone influences—the numbers that determine how skin follows
the skeleton. Re-solving those influences for the entire body after a hand edit
could change an already reviewed elbow or torso even though its shape did not
change. The untouched body's existing positions and influences therefore remain.

The plan asks for credible hands but leaves this offline construction method
open. This gives subsequent hand revisions one local owner and keeps their
effects reviewable. It does not freeze the current coarse palm or tubular fingers
as the final design; wrist joins, gripping shape and future poses still require
visual approval. No runtime fitting or extra animation system is introduced.

### Convert authored forward at export while preserving editable source space (08–11)

**Sound; confidence: high.** An authored soldier faced backward when moved through
the production fixture. The exporter now turns the whole bound assembly into the
engine's forward direction and then restores the editable Blender scene. Existing
hand and equipment construction coordinates remain usable, while exported bones,
skin and equipment agree with ordinary production movement. Detail-view cameras
turn their source-space landmarks together; the travel fixture does not reverse
its movement to hide the mismatch.

The plan requires the production coordinate contract but did not prescribe
whether to rewrite all authoring coordinates or convert at the file boundary.
One shared exporter is the narrower owner. Future models using it must share its
authoring convention; a model authored in another convention must deliberately
resolve that boundary instead of adding a renderer exception. Re-exporting a
frozen study preserves its saved actions rather than regenerating newer motion.

### Two-cycle prescribed travel review (11)

**Sound; confidence: medium.** When reviewing walking or running, the candidate
travels through a fixed camera for two full animation cycles. The scene samples
every 50 ms and the review GIF displays each frame for the same 50 ms, so the
reviewer sees the authored rhythm at the prescribed speed and can inspect the
clip boundary. The GIF jumps back to the beginning only after the complete
traversal. This is a bounded inspection window, not proof of every subframe's
contact or of the actual simulation speed.

The task requires moving-world evidence but leaves the sampling interval and
number of steps open. Two cycles expose both foot alternation and the wrap
without making one authoring check a long replay. The original all-authored-frame
in-place sheets remain available. Later contact acceptance must retain finer
grounding evidence where this display sampling cannot resolve it.

### Preserve the editable equipment assembly across a local anatomy revision (08–09)

**Sound; confidence: high.** A hand change should not quietly reshape a helmet.
Re-running all automatic equipment fitting did exactly that, so this integration
keeps the already fitted equipment objects and replaces only the body's edited
source. The saved Blender assembly remains editable and is exported normally.
Re-running the fitting recipe later is a deliberate new fitting pass whose
results must be compared, not assumed unchanged because its script is unchanged.

The plan leaves the assembly method open. This choice constrains future local
edits to preserve unrelated authored parts unless a refit is actually needed;
it introduces no runtime correction or second asset loader. The alternative—
silently accepting everything a full regeneration changes—would make focused
visual review unreliable.

### Cinch the belt to the pelvis, not the moving thigh (09 authoring)

**Sound; confidence: medium.** When a leg swung forward, the belt followed it
strongly enough to disappear into the shirt. Its inherited automatic skin
weights made the thigh control much of the waist, even though the belt sits
above the hip joint. The isolated garment candidate instead gives the unchanged
belt shape pelvis support and makes the narrow cinched band of cloth share that
movement. Cloth above and below transitions into its other authored movement.
The alternative—making the whole shirt follow the faulty belt—would preserve
contact by spreading the wrong motion.

The plan requires credible worn equipment but leaves its attachment weighting
open. This deliberately expands the garment-only edit to belt weights; it does
not authorize changing unrelated equipment. Suspension joins and loaded poses
must be rechecked after composition and on future actions. The combined root
candidate now adopts this weighting; it is not final equipment acceptance.

### Make lining the mail's construction and motion support (09)

**Sound, provisional; confidence: medium.** The lining and main mail share
corresponding subdivided surface locations and bone weights. Mail thickness is
offset from the actual lining, not fitted independently to whichever nearby body
part wins a nearest-point search. The torso samples trunk-supported body faces
with interpolated support normals; separate overlapping sleeves and the shoulder
reinforcement follow the garment they rest on. This prevents adjacent resting
arms or discontinuous triangle normals from folding the shirt into itself.

The spec asks for layered, moving coverage but leaves construction topology and
deformation ownership open. These offline authored pieces add no rig, cloth
simulation or runtime fitting mechanism. They trade physically simulated drape
for inspectable fixed construction; shoulder corners and running skirt stiffness
remain refinements. New anatomy or new extreme actions require renewed fitting
and visual review, not an assumption that indexed correspondence proves clearance.

### Derive authored leg reach from the actual rest joints (11 support revision)

**Sound; confidence: high.** When the knee bends, the ankle does not follow the
path of two perfectly vertical leg segments: the saved skeleton already has
slightly angled thighs and shins. The offline Blender author now rotates that
actual ankle offset to find the thigh angle for the chosen backward foot travel.
The game still receives ordinary animation keys; it gains no foot solver or
extra animation state. The unbuilt alternative adjusts stride constants to hide
the error on this particular skeleton, leaving future rig changes to rediscover
the same mismatch.

The plan delegates stride style but does not prescribe the offline geometric
calculation. This choice makes the saved rest joints its source of truth. Ready
is deliberately preserved in this focused gait revision; its separate static
calculation is not represented as a general contact solution. A changed skeleton
still requires reauthoring and visual review, not blind reuse of the old keys.
