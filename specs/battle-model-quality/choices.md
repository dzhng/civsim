# Final implementation choices

This ledger describes the final implementation, not its build order. Superseded
experiments, temporary scaffolding and gate narration have been removed.
The user explicitly accepted the current visual quality and a performance
follow-up. That is not a claim that the unchanged performance thresholds passed:
the [current performance spec](../sim-perf/model-rendering-follow-up.md) owns
that work. Engine behavior, timing and saves remain authoritative.

Review first: completed-interval approximation, directional gait/phase policy,
and practical mesh reduction. These carry the most remaining judgment. There
are no outstanding user-only decisions here; explicitly accepted follow-ups
are not unresolved requests for permission.

## Sound — medium confidence

### 1. Display completed movement rather than predict beyond known positions

**When:** locomotion/live-consumer integration (11).
Two observations saying a soldier travelled one metre do not reveal when he
started within that interval. Live rendering interpolates the known endpoints
and distributes qualified travel across that interval. An eligible existing
gait owns its stride until the endpoint; compatible standing can infer onset at
the interval's beginning. Combat, disability or changed posture cannot be
backdated into walking. Finer event history would be the unbuilt alternative.
**Gap:** chronology and display latency were unspecified. **Reach:** root
position, facing, life/equipment state and pose now share retained time. Mixed
boundaries remain approximate, not proven foot contact.
**Verdict:** sound use of known history without changing the engine;
**confidence: medium**.

### 2. Count motor-capable constrained travel, not voluntary propulsion

**When:** movement observation integration (11).
A stunned man can slide and recover before the browser sees him. The engine
qualifies ticks where ordinary or routing movement actually ran, then counts
final constrained displacement. Conscious pressure recovery can count as
possible stepping; disabled momentum does not. Three cumulative double-precision
values retain X/Y net motion and summed path length, so opposite steps do not
cancel gait distance. Endpoint subtraction loses that distinction; exporting
all forces would be a larger contract.
**Gap:** qualification and transport were unspecified. **Reach:** these
read-only counters inform animation, never movement decisions or saves. They
do not reconstruct a batch's direction order or prove intentional effort.
**Verdict:** sound minimal truthful measurement; **confidence: medium**.

### 3. Use nearest authored pace and nearest-cardinal protected travel

**When:** distance playback/protected selection (11).
An ordered runner moving slowly walks below the midpoint of the bound walk/run
nominal speeds: cycle distance divided by duration. The exact midpoint chooses
walk. Moving, non-routing, not-at-ease soldiers with the engine's guarding-facing
output may use backward/left/right clips. The largest signed component chooses
direction; longitudinal wins ties. Missing bindings or zero net direction retain
ordinary selection rather than inventing a pose.
**Gap:** crossover and diagonal approximation were unspecified. **Reach:**
normalized cycle progress survives gait changes, even with different leading
feet. This is not phase-matched foot planting; richer blending remains unbuilt.
**Verdict:** sound bounded reversible policy; **confidence: medium**.

### 4. Preserve detailed originals and export practical runtime copies

**When:** roster distance delivery (15/28).
A fitted model can contain more detail than thousands of simultaneous soldiers
can afford. Offline exports produce near/mid/far copies with initial triangle
targets 8,000/1,000/800; detailed Blender assemblies and original exports remain
editable. Reduction treats disconnected pieces separately, keeps a minimum per
retained piece, and may omit sufficiently small distant pieces. Thin long
weapons are not discarded merely for thinness. Whole-mesh collapse could erase
a spearhead before substantially simplifying the body.
**Gap:** reduction algorithm and allocation were unspecified. **Reach:** targets
are not exact counts or performance guarantees. Future optimization rebuilds
copies rather than degrading the saved source.
**Verdict:** sound under the explicit delivery priority, with visible faceting
and detail loss disclosed; **confidence: medium**.

### 5. Reuse fitted action families with real weapon-specific corrections

**When:** foot, pike, mounted and crew completion (17–27).
A spear infantryman reuses suitable fitted body motion but receives an actual
spear grip/effort, not a renamed sword swing. The two-hand sword reuses the
medium body's axial effort with both purchases fitted to its hilt. Mounted
actions preserve horse/rider ownership. Independently polishing every class
before completing the roster was the unbuilt alternative.
**Gap:** sharing was permitted but assembly/retarget strategy was unspecified.
**Reach:** recognizable but stiff or similar motions remain; names do not make
them physically complete.
**Verdict:** sound completion-first reuse without dummy bindings;
**confidence: medium**.

### 6. Construct supported garments and grips offline, not with runtime constraints

**When:** anatomy/equipment authoring (08–12).
Shirt points take interpolated bone weights from supporting body triangles;
mail/leather follows its actual lining. Belts and rigid sheaths use pelvis
support instead of accidentally following thighs. Hands remain on the existing
arm rig, with local hand edits preserving untouched body weights. Offline arm
solving uses actual joint lengths and, where needed, retained fitted hand roll.
The alternative adds cloth/finger constraints or hand-authors every weight.
**Gap:** exact construction and rig allocation were unspecified. **Reach:**
four normalized influences and matched surface locations do not guarantee every
posed clearance. New anatomy/extreme actions require deliberate refitting.
**Verdict:** sound inspectable construction at the accepted quality, not a
universal anatomical solution; **confidence: medium**.

### 7. Store small surface detail in one appearance texture sheet

**When:** first-pair and roster surfaces (10/18/22/26).
Skin, leather and metal read different regions of shared color, normal and
roughness/metal maps. Mail relief is baked from editable ring geometry rather
than drawing every ring. The shared source uses three 2,048-square images.
Separate per-piece images or runtime ring meshes would cost different resources.
**Gap:** packing and resolution were unspecified. **Reach:** image regions and
UV coordinates must be rebuilt together; this resolution is not a whole-roster
memory guarantee.
**Verdict:** sound explicit offline detail ownership; **confidence: medium**.

### 8. Share material meaning without duplicating Three's lighting engine

**When:** material transport (04).
The same helmet can look different in battle's Three renderer and the raw
campaign renderer. Both consume authored color, roughness, metalness and maps,
but the raw renderer retains its simpler lighting model. Exact lighting parity
would require substantially more shared or duplicated shading machinery.
**Gap:** source fidelity did not specify identical lighting pixels. **Reach:**
future raw work must preserve material response; parity is separate scope.
**Verdict:** sound shared data without a second full lighting implementation;
**confidence: medium**.

### 9. Retain the far bake's resource ownership and current edge sampling

**When:** far material baking (04/15).
A distant soldier image uses its own appearance's mesh and bound ready pose,
retaining equipment identity rather than borrowing a generic soldier. It stores
surface properties for lighting, not a permanently lit photograph. Its render
target retains the bake depth attachment until
disposal even though later drawing does not sample it. Current sampled edge
coverage remains rather than introducing a new smoothing system.
**Gap:** attachment lifetime and coverage cost were unspecified. **Reach:**
retained memory and thin-edge artifacts remain follow-ups; unused depth is not
free. Separate early attachment disposal would add lifecycle complexity.
**Verdict:** sound explicit simplicity/cost tradeoff; **confidence: medium**.

### 10. Grow exact pose storage synchronously and keep stable reusable slots

**When:** GPU playback/storage (06/07).
More interruptions can require more saved poses. Storage grows before a complete
new binding generation publishes; surviving snapshots keep their slots while
new snapshots reuse holes. Even/odd slots occupy two GPU buffers to fit each
shader input's size limit without rounding poses. The alternative compacts every frame,
preallocates maximum capacity, or drops detail.
**Gap:** growth and physical layout were unspecified. **Reach:** slack,
temporary overlapping generations and an extra binding are real costs.
**Verdict:** sound bounded exact storage with a synchronous API;
**confidence: medium**.

### 11. Preserve precise immutable interruption sources until GPU packing

**When:** interruption ownership (05/06).
A hit interrupting a blend retains the actual double-precision local transforms
in immutable arrays. Smaller GPU floats are produced when preparing joint
matrices, not earlier to save space. Earlier rounding changes the source;
repeatedly copying mutable arrays adds continuing cost.
**Gap:** snapshot representation was unspecified. **Reach:** memory includes
objects/arrays as well as numeric payload; consumers cannot mutate or transfer
the controller's source.
**Verdict:** sound continuity ownership with explicit memory cost;
**confidence: medium**.

### 12. Correlate timing by frame and measure allocations separately

**When:** animated budget instrumentation (07).
Animation, shadows and final shading submit separate work. Scene-owned GPU
markers bracket it and retain the originating frame through delayed readback.
A bounded slot pool reports missing measurements, not stale values. A separate
run counts resource creation/destruction by phase so accounting does not inflate
CPU timings. Cached renderer timings or size formulas alone cannot do this.
**Gap:** the instrument was unspecified. **Reach:** queue elapsed time includes
submission gaps; API-live requested bytes are not physical VRAM. Coverage and
uninstrumented controls remain necessary.
**Verdict:** sound qualified measurement; **confidence: medium**.

## Sound — high confidence

### 13. Publish immutable bundles before switching the catalog

**When:** final roster cutover (30).
Rebuilding a class writes its complete bundle to a directory named from a
checksum of its content.
Existing directories are checked, not overwritten. Only after all requested
rows exist does publication replace the catalog pointing to them, so a failed
row cannot leave the old catalog pointing at half-new files. The review matrix
comes from those same bindings rather than separate hand-maintained state.
**Gap:** publication semantics were unspecified. **Reach:** old bundles remain
until deliberately retired. Matrix and catalog are separate renames, not one
filesystem transaction; runtime catalog publication is authoritative.
**Verdict:** sound last-good publication without mutable-bundle races;
**confidence: high**.

### 14. Resolve gameplay clip names through the manifest, including campaign

**When:** action admission/final consumer cutover (05/30).
A campaign army asks its appearance for marching or standing motion instead of
assuming every source calls those clips walk or idle. The caller supplies the
existing stack builder's clipForClass selection; battle's timeline reads the
same manifest role vocabulary. Manual inspection still lists arbitrary clips.
**Gap:** consumer naming was unspecified. **Reach:** new assets update their
bindings, not scattered renderer string tables. Missing required roles reject
instead of selecting an inspection pose.
**Verdict:** sound one gameplay vocabulary; **confidence: high**.

### 15. Isolate synthetic content in explicitly named diagnostic catalogs

**When:** placeholder cutover (30).
A raw material or timing diagnostic may deliberately load a block-shaped fixture
to isolate a contract. Battle, campaign and ordinary model consumers instead
load the authored roster. The fixture catalog is explicitly selected, never a
fallback for a failed production load. Deleting useful test inputs was the
unbuilt alternative.
**Gap:** removing placeholder production content did not define diagnostic
retention. **Reach:** tests must disclose what catalog/workload they measure.
**Verdict:** sound content isolation on shared infrastructure;
**confidence: high**.

### 16. Let saved fitted geometry own the soldier; compose motion around it

**When:** first-pair composition and roster reuse (09–27).
Adding an action opens the saved fitted Blender assembly rather than rerunning
an older generator that would also reshape a helmet or shield support.
Compatible donor actions compose through the existing motion owner. Deterministic
base reconstruction prevents repeated authoring from accumulating transforms.
One export boundary converts source forward and restores editable coordinates.
**Gap:** saved-source versus recipe ownership was unspecified. **Reach:**
necessary refits are scoped edits; unchanged scripts do not prove unchanged
fitting. Other authoring conventions must resolve at the export boundary.
**Verdict:** sound one editable geometry owner; **confidence: high**.

### 17. Ship fresh exports, not tangent-byte pinning

**When:** motion integration/practical exports (11/15/28).
Re-export can change tangents, the directions used for normal-map shading, even
when positions remain unchanged. Final assets use the real fresh export;
historical byte-pinned comparisons do not become a bake fallback. Reduced copies
triangulate and correct genuinely degenerate smooth faces before admission
rather than weakening the normal-map validity rule.
**Gap:** rounding and reduced-face degeneracy were unspecified. **Reach:**
future comparisons must evaluate actual output, not force old values to conceal
an asset change.
**Verdict:** sound source honesty; **confidence: high**.

### 18. Match reduced rigs and materials by meaning rather than index

**When:** weighted import/practical reductions (03/28).
Blender can reorder bones or remove an unused material when a distant piece is
omitted. Import matches unique bone names, parentage and bind transforms, then
remaps vertex references. Retained material settings, image bytes and sampling
must match semantically, not merely occupy the old array slot.
**Gap:** cross-tier identity was unspecified. **Reach:** harmless reordering is
accepted; a different skeleton or retained surface is not. Omission does not
authorize arbitrary material changes.
**Verdict:** sound semantic identity; **confidence: high**.

### 19. Keep one read-only battle observation boundary

**When:** battle views/adapter/live verification (05/11/30).
When WebAssembly memory grows, one view owner refreshes pointers and counts.
One adapter reads injury, equipment, posture and qualified travel; the timeline
owns action policy. A debug motor-path getter reads that same cumulative value,
rather than computing a second movement history or exporting all forces.
**Gap:** module/diagnostic boundaries were unspecified. **Reach:** new
observations must retain simulation-owned meaning, lifecycle handling and
read-only use; no presentation caller gains permission to modify movement.
**Verdict:** sound minimal ownership; **confidence: high**.

### 20. Measure signed motion against the facing actually displayed

**When:** signed/guarded observations (11).
A held-pike soldier may display unit frontage rather than his individual angle.
Net interval movement is projected against that final displayed facing, positive
lateral meaning right. Per-soldier packed posture carries actual selected-facing
branch outputs and current incapacity; pikes choose the same owner as the visible
angle. Routing reuses unit information.
**Gap:** sign convention and transport were unspecified. **Reach:** fresh outputs
avoid stale guard flags, but retained facing alone does not imply a threat or
deliberate stepping.
**Verdict:** sound consistent basis without new gameplay states;
**confidence: high**.

### 21. Hold disabled future gait without erasing past travel or safe posture

**When:** final-disabled playback (11).
A soldier can move during a completed interval and end disabled. That travel
still counts, but the gait stops extrapolating. Existing blends and combat
continue their time-driven behavior. Without compatible gait history, at-ease,
pike-ready or ready still follows the engine; incapacity does not force defense.
**Gap:** disable boundaries were unspecified. **Reach:** this freezes a gait
clock, not the whole pose or a physical collapse. Recovery uses the ordinary
measured-motion policy.
**Verdict:** sound canonical posture/time ownership; **confidence: high**.

### 22. Put stride/release calibration beside existing clip metadata

**When:** distance playback/action baking (05/11/20).
One metre of movement needs an authored cycle distance; a shot needs an authored
release marker. Existing bake metadata supplies both, with local/GPU timing
agreement required at admission. Standing/combat remain time-driven. Separate
renderer tables or geometry re-export solely for metadata were the alternatives.
**Gap:** calibration ownership was unspecified. **Reach:** fixture rates remain
explicit synthetic inputs, not physically calibrated legs or engine speed orders.
**Verdict:** sound one calibration path; **confidence: high**.

### 23. Start release recovery from the engine event; author tool visibility

**When:** release/ranged delivery (05/20/24/27).
If a projectile is already airborne, age comes from the engine's countdown and
its own duration. Current ranged markers start recovery at release, hiding the
held projectile rather than beginning a windup after emission. Melee tools use
authored child-joint visibility; rider masks include those joints.
**Gap:** entry/tool visibility were unspecified. **Reach:** anticipation needs
an earlier truthful observation. Animation cannot delay shots or own flight,
and no second runtime equipment state machine is introduced.
**Verdict:** sound engine-first timing; **confidence: high**.

### 24. Distinguish held-pike readiness from unobserved brace strength

**When:** medium ready/thrust authoring (12).
The held hedge is pike-ready. The engine's continuous brace ramp is not exposed
to animation, so no invented brace clock or strength state is added. Thrust
duration is an art cadence, not the engine's damage interval or weapon reach.
**Gap:** the word brace did not settle this distinction. **Reach:** future
contact/brace animation needs truthful observations instead of relabeling a pose.
**Verdict:** sound separation of posture and mechanics; **confidence: high**.

### 25. Freeze the correct composed source at an interruption

**When:** layered/completed-endpoint timeline (05/11).
A rider can start shooting when the horse's measured speed changes. The upper
transition freezes the complete prior composed source; unmasked horse motion
follows corrected distance. Whole-body hit/death keeps whole-pose continuity.
The latest-completed before query exposes the endpoint before its new events,
not an arbitrary history archive.
**Gap:** simultaneous correction and query semantics were unspecified.
**Reach:** immutable prior ownership prevents working gait refreshes from
rewriting what was interrupted; no extra blend conceals distance correction.
**Verdict:** sound one timeline; **confidence: high**.

### 26. Reset visual history when a new catalog is accepted

**When:** reload/live composition (05/11).
A successful model reload starts history from current observations, including
dead soldiers, instead of blending across possibly incompatible old bones.
A failed reload retains the old catalog/history. New bodies have no invented
past interval.
**Gap:** cross-rig continuity was unspecified. **Reach:** authoring reload
deliberately loses visual progress, never gameplay state.
**Verdict:** sound explicit reset over unsafe pose reuse; **confidence: high**.

### 27. Let death animation own orientation and life state own corpse treatment

**When:** GPU blending/reactions/manual parity (06/13/30).
An authored fallen body receives no extra random roll that could push it below
ground. Recoloring/contact treatment eases with the existing death transition;
manual dead poses get final treatment. Removed variation data leaves zero padding
in the aligned GPU record. A manual death clip does not silently imply dead:
life state is an independent input, including per-pose overrides on mixed sheets.
**Gap:** inherited effects and inspection controls were unspecified. **Reach:**
new variations must be authored, and clips cannot redefine canonical life state.
**Verdict:** sound one orientation owner and explicit inspection inputs;
**confidence: high**.

### 28. Keep candidate review, portraits and sheets on the production poser

**When:** workbench/consumer delivery (01–30).
The production world retains the chosen candidate catalog for reload, rather
than a second viewer loading it differently. Review may hide foliage occluders
while retaining ground/light/shaders. Body portraits frame the person; full-kit
sheets separately expose long weapons. Fixed crops keep actual pixels instead
of deleting RGB colors that might also belong to skin or equipment.
For a moving full-kit sheet or film, the camera fits the union of posed geometry
across the clip's exported keys and review samples. It stays still as the weapon
moves; fitting each frame separately would make the camera appear to breathe.
The existing animation decoder and skinning calculation supply these positions,
so this does not introduce a second definition of the soldier's pose.
**Gap:** scenery/framing were unspecified. **Reach:** a portrait is not full
weapon-clearance evidence, and an isolated sheet is not battlefield occlusion.
Manual pose edits leave replay; camera edits preserve it.
**Verdict:** sound explicit review scope; **confidence: high**.

### 29. Give each prepared appearance complete immutable surface ownership

**When:** material round trip/reload (04).
Material slots can use regions/channels of one appearance image set; competing
images for one channel reject rather than being silently combined. Exact
embedded binary/data-URI image bytes survive import; external references reject.
Browser decoding owns final codec validity. Absent maps receive neutral bindings,
but failed declared maps never do. Prepared material/image/sampler resources
share only inside one disposable preparation, with sequential image loading.
Omitted sampling settings follow the standard glTF loader's defaults; explicit
sampling settings remain authored inputs.
**Gap:** grouping, codec and cache lifetime were unspecified. **Reach:** live
editing or parallel loading must explicitly preserve cleanup; JavaScript array
mutation is not a GPU editing API. Missing faction attributes mean unmarked
geometry, while malformed present attributes reject rather than becoming zeros.
**Verdict:** sound batching and failure ownership; **confidence: high**.

### 30. Reject unsupported source math and conservatively bound blended poses

**When:** weighted import/material/GPU admission (03–06).
An almost plausible rotation or bind can become invalid on the GPU. Admission
requires near-unit rotations in source and Float32 form, affine binds, packable
normal scales and valid mapped directions throughout the existing bounds scan.
The established weighted normal rule uses a geometric fallback only at an
interpolated collapsed limit, not to admit bad source. Hierarchy-based bounds
cover unsampled turns/blends rather than guessing from endpoint boxes.
**Gap:** numerical domain/bounding method were unspecified. **Reach:** exporters
must satisfy the domain; conservative spheres can retain more off-screen work
and must not silently change review framing.
**Verdict:** sound explicit supported math over hidden repair;
**confidence: high**.

### 31. Separate camera representation from shadow representation

**When:** projected detail planning (07/15).
A soldier outside the eye camera may cast a visible shadow. One planner considers
both audiences, allowing a far image for the eye and a mesh for the sun. Both
use one pose slot, but images do not cast mesh shadows. Separate resource owners
avoid accidental shared-buffer retirement.
**Gap:** the original visibility rule did not choose this split. **Reach:**
future LOD work must preserve both audiences and count their geometry cost.
**Verdict:** sound visibility rather than merged distance shortcuts;
**confidence: high**.

### 32. Preserve last-good reloads, but suppress partially uploaded live crowds

**When:** reload/GPU failure handling (01/04/06).
A failed catalog replacement can retain the old scene because preparation is
separate. A failed live frame may already have changed one skeleton group, so
the crowd stays suppressed until a complete upload succeeds. Potentially
overwritten snapshot slots reupload; replacement poses submit before materials
publish. Closing a world prevents pending reloads from reviving it.
**Gap:** rollback scope and ordering were unspecified. **Reach:** this does not
promise old pixels after a partial frame or add a general rollback system.
**Verdict:** sound explicit failure boundaries; **confidence: high**.

### 33. Share exact work while keeping ownership and framework lifetimes explicit

**When:** bounded runtime work (06/07).
Identical interruption inputs may share a frozen result within one update;
different phases or appearances may not. Observing records state without building
discarded playback, and sampling produces output. Packing reuses cleared private
scratch/stable worklists; returned planner answers stay independently owned.
Compute-only storage retires through the pinned Three attribute cache after its
consumers, rather than fake geometry ownership. Timing failure stops further
query allocation instead of reporting stale success.
**Gap:** optimization and framework boundaries were unspecified. **Reach:**
there is no pose quantization, and upgrades must revalidate cleanup. These
changes do not promise that irregular animated crowds meet the budget.
**Verdict:** sound bounded exact reuse with explicit dependency;
**confidence: high**.

### 34. Separate numerical equivalence from identical-input image repeatability

**When:** material/animation oracle corrections (04/06/11).
Equivalent CPU/GPU arithmetic can differ minutely at a silhouette edge. Tests
independently bound actual GPU transforms, then check rendered consumption using
validated transforms and matching position arithmetic. Event checks retain exact
local sources, same-side repeats and a same-palette image control. Isolated
pairs start with equal visibility/shadow history; continuous tests keep theirs.
**Gap:** math tolerance was not a raster criterion. **Reach:** this allows
neither arbitrary bad pixels nor looser ordinary baseline repeats.
**Verdict:** sound independent proofs, not circular reference;
**confidence: high**.

### 35. Keep fixture timing, scope and workloads explicit

**When:** production verification (01–30).
A second pose in one browser frame may leave stale post-process content, so
captures wait for the real frame/settled draw rather than retrying for lucky
pixels. Far inspection obtains real projected admission before magnification.
Snapshot filters skip unrequested work; only full runs cover the full scene.
The named live body-region gate does not claim excluded HUD acceptance.
Cold authored-catalog loading may take longer than a functional scene's old
startup allowance. These scenes wait up to 60 seconds for the same readiness
predicates; they still fail if loading never completes. This is a functional
startup ceiling, not a claimed loading-time guarantee or frame-time pass.
Synthetic cost fixtures add referenced equivalent detail, not fake unused bones;
the retained full-detail benchmark remains distinct from normal gameplay LOD.
**Gap:** fixture scheduling and subjects were unspecified. **Reach:** mapped
skin vertices, controlled rider joints and declared camera/workload remain the
measured subjects. Paused/synthetic tests cannot certify full live performance.
**Verdict:** sound distinct scopes; raster and frame-time thresholds unchanged;
**confidence: high**.

### 36. Share the weighted GPU layout and bounded rotation calculation

**When:** weighted mesh and GPU interpolation (03/06).
An elbow vertex keeps all four contributing bones rather than losing weights
to fit a device's vertex-buffer limit. Both renderers use one shared packed
layout. Their rotation blend takes the shorter turn between orientations and
uses the same bounded angle/sine
calculation rather than GPU built-ins whose permitted error exceeds the pose
contract. This is a narrowly scoped rotation calculation, not a general math
library. **Gap:** encoding/interpolation were unspecified. **Reach:** new
channels extend the shared owner, and the extra arithmetic/storage cost remains
part of the measured workload.
**Verdict:** sound consistent deformation and numerical meaning;
**confidence: high**.

### 37. Keep body continuity across exactly compatible equipment rigs

**When:** equipment continuity closeout (14).
When the engine replaces a pike with a sword, the new equipment appears on that
same observation. If both assets have identical bone names, hierarchy and bind
transforms, the body starts from its previous composed pose and uses the existing
short blend toward the new action. Old clip indices never enter the new asset.
Different skeletons still reset. The alternative would either snap every body,
or require a general skeleton remapper and authored draw/sheath choreography.
**Gap:** safe pose reuse across separate equipment bundles was unspecified.
**Reach:** this preserves skeletal continuity, not continuous weapon geometry;
the sword initially follows the previous hand pose. No extra weapon, switch
clock or simulation authority is introduced.
**Verdict:** sound reuse of identical local spaces within the existing timeline;
**confidence: high**.
