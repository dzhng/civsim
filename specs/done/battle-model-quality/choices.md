# Final implementation choices

Review first: reconstructing movement between observations, choosing a gait
from measured speed/direction, and reducing detailed models for gameplay. These
are the least-certain judgments below. All retained choices are sound; none
requires a new user decision. Confidence means confidence that the user would
make the same tradeoff, not a test score.

The user accepted the current art and a separate performance follow-up. Those
explicit directions are not unresolved implementation choices. The
[performance follow-up](../sim-perf/model-rendering-follow-up.md) owns the
remaining optimization work; this ledger makes no performance-pass claim.

## Sound — medium confidence

### 1. Show completed movement instead of predicting an unknown future

**When:** live locomotion integration (11).
If the browser learns that a soldier moved one metre between two observations,
it knows the endpoints but not the exact instant he started. The display spreads
that qualified travel across the completed interval. An existing eligible gait
keeps its own stride length through that interval, even if the next observation
selects a different gait. Compatible standing can start walking at the earlier
endpoint; combat, disability or changed posture cannot be rewritten as walking.
If he ends disabled, completed travel remains counted but future gait progress
stops. Other action/blend clocks continue, and a soldier without usable gait
history retains the engine's standing posture. Recording every intervening
event would remove some of this approximation at a larger transport cost.

```text
account for qualified travel in the completed interval
apply the newly observed action, equipment and disability
sample the retained interval; do not invent future movement
```

**Gap:** chronology and display latency were unspecified. **Reach:** root,
facing, equipment, life and pose share retained time; mixed boundaries are still
approximate and do not establish planted feet. **Verdict:** sound use of known
history without changing the engine. **Confidence:** medium.

### 2. Measure movement that could involve stepping, not voluntary effort

**When:** movement observations (11).
A stunned soldier can slide, then recover before the browser reads him. The
engine records final constrained displacement only on ticks where its ordinary
or routing movement branch ran. Enabled pressure recovery therefore counts as
possible stepping; disabled transport does not. Three cumulative double-precision
numbers retain net X/Y travel and total path length: one step forward and one
back cancel direction, but not the distance available to animate. Subtracting
browser endpoint positions would lose that distinction; exporting every force
would make a much larger interface.

**Gap:** qualification and transport were unspecified. **Reach:** these
read-only observations neither change movement nor enter saves, and they cannot
recover the order of directions within a batch or prove intentional effort.
**Verdict:** sound minimal measurement with an explicit interpretation.
**Confidence:** medium.

### 3. Pick the nearest authored pace and a cardinal protected direction

**When:** distance playback and protected travel (11).
A man ordered to run may actually move slowly. His measured speed chooses walk
or run by proximity to each clip's nominal speed: cycle distance divided by
duration. An exact midpoint chooses walk. When the engine says he retains a
guarding facing, a moving, non-routing, not-at-ease man can use backward or
sideways protected walking. The larger signed movement component chooses the
direction; forward/backward wins a diagonal tie. A missing binding or zero net
direction leaves ordinary selection rather than inventing an action. A richer
direction blend and synchronized foot-contact transitions are not implemented.

**Gap:** crossover and diagonal approximation were unspecified. **Reach:**
normalized cycle progress survives gait changes, but different leading feet
can still produce imperfect transitions. **Verdict:** sound bounded policy
that can later be refined without changing movement. **Confidence:** medium.

### 4. Reduce runtime copies while preserving detailed editable sources

**When:** distance representations (15/28).
A fitted soldier may be too detailed to draw thousands of times. Offline
export makes near/mid/far copies, initially targeting 8,000/1,000/800 triangles,
without reducing the saved Blender source. Disconnected pieces receive their
own reduction allowance and minimum retained geometry. Small distant pieces
may disappear; a long thin spear is not discarded simply because it is thin.
Reducing the whole assembly indiscriminately could erase its identity before
saving much of the body's cost.

**Gap:** reduction and allocation were unspecified. **Reach:** targets are
not exact counts or speed guarantees; faceting and lost detail remain visible,
and future optimization must rebuild copies from the source. **Verdict:** sound
under the accepted completion-first priority. **Confidence:** medium.

### 5. Reuse action families, but fit the actual weapon and body

**When:** foot, pike, mounted and crew completion (17–27).
A spearman can reuse suitable body effort, but his hands and thrust are fitted
to a spear rather than attaching a spear to a renamed sword swing. The
two-handed sword receives both hand purchases on its hilt; mounted actions
retain separate horse and rider responsibilities. Independently polishing every
class's motion before completing the roster was the alternative.

**Gap:** sharing was permitted, but composition and fitting were unspecified.
**Reach:** classes can still look stiff or similar; reusable action names do
not make their physical motion complete. **Verdict:** sound completion-first
reuse without dummy gameplay bindings. **Confidence:** medium.

### 6. Fit clothing and grips offline instead of adding runtime solvers

**When:** anatomy and equipment authoring (08–12).
A shirt point inherits interpolated bone influence from the body triangle
supporting it. Mail/leather follows its actual lining; belts and rigid sheaths
follow the pelvis rather than a nearby thigh. Hands use the existing arm rig,
and local hand edits preserve untouched body weights. Offline arm fitting uses
actual joint lengths and retained hand roll where needed. Cloth simulation,
separate finger constraints, or manually weighting every point are unbuilt
alternatives.

**Gap:** construction and rig allocation were unspecified. **Reach:** four
normalized bone influences do not guarantee clearance in every extreme pose;
new anatomy/actions still need deliberate refitting. **Verdict:** sound
inspectable construction at the accepted quality, not a universal anatomy
solution. **Confidence:** medium.

### 7. Store small surface details in one appearance image set

**When:** surface authoring (10/18/22/26).
A helmet and shirt read different regions of shared color, normal and
roughness/metal maps. A normal map changes the apparent surface direction to
show small relief without adding that geometry to every runtime soldier; mail
relief is baked from editable ring geometry. The shared source uses three
2,048-square images. Per-piece images or drawing each ring would trade different
memory, draw and authoring costs.

**Gap:** packing and resolution were unspecified. **Reach:** image regions and
their UV coordinates must change together; this resolution is not a whole-roster
memory guarantee. **Verdict:** sound explicit offline detail ownership.
**Confidence:** medium.

### 8. Share material meaning, not a second copy of Three's lighting engine

**When:** material transport (04).
The same authored helmet is shown by battle's Three renderer and campaign's
simpler raw renderer. Both read its color, roughness, metalness and maps, but
their lighting need not produce identical pixels. Exact lighting parity would
require substantially more shared or duplicated shading machinery.

**Gap:** source fidelity did not specify identical lighting output. **Reach:**
future raw-renderer work must preserve material response; matching the complete
lighting model is separate scope. **Verdict:** sound shared data without a
second full lighting implementation. **Confidence:** medium.

### 9. Keep distant-image baking simple, including its retained depth cost

**When:** far material baking (04/15).
A far-away soldier uses an image made from that appearance's own mesh and bound
ready pose, so his equipment is not borrowed from a generic soldier. The image
stores surface properties for later lighting, not a permanently lit photograph.
Its render target retains the bake's depth attachment until disposal even though
later drawing does not sample depth. Current edge sampling also remains; early
depth disposal and a new edge-smoothing system would add lifecycle/rendering
work.

**Gap:** attachment lifetime and edge-coverage cost were unspecified.
**Reach:** unused depth still costs memory and thin edges can show artifacts.
**Verdict:** sound explicit simplicity/cost tradeoff. **Confidence:** medium.

### 10. Own interruption poses precisely and grow reusable GPU storage on demand

**When:** interruption and GPU storage (05–07).
When a hit interrupts a partly blended pose, the controller keeps immutable
double-precision local transforms: each bone's position, rotation and scale
relative to its parent. Smaller GPU floats are produced during joint-matrix
preparation, not used to round away the retained source. Saved poses keep stable
slots; new poses reuse holes, and storage grows synchronously when needed.
Even/odd slots occupy two GPU buffers so each input fits the device's binding
limit. A complete new resource generation publishes together. Earlier rounding,
maximum preallocation or per-frame compaction are the alternatives.

**Gap:** representation, growth and layout were unspecified. **Reach:** exact
continuity costs array/object memory, spare capacity, an extra binding and
temporary old/new overlap. Callers cannot mutate or transfer the controller's
source. **Verdict:** sound exact ownership with explicit costs.
**Confidence:** medium.

### 11. Correlate timing with its originating frame and count resources separately

**When:** budget instrumentation (07).
A frame submits animation work, shadows and final shading separately. GPU
markers surround the intended work, and delayed results retain that frame's
identity. A bounded measurement-slot pool reports missing samples instead of
reusing an old successful number. Resource creation/destruction is counted in a
separate run so the bookkeeping does not inflate CPU timings. Cached renderer
timings or formulas alone cannot establish either measurement.

**Gap:** the instrument was unspecified. **Reach:** queue elapsed time includes
submission gaps, and requested bytes in live GPU resources are not physical
VRAM use. Coverage and uninstrumented controls remain necessary.
**Verdict:** sound qualified measurement. **Confidence:** medium.

## Sound — high confidence

### 12. Publish complete immutable bundles before switching the catalog

**When:** roster cutover (30).
A rebuilt class writes its complete bundle under a content-checksum name.
An existing directory is checked, not overwritten. The catalog switches after
all requested rows exist; one failed row cannot leave the old catalog pointing
at half-new files. The review matrix derives from those bindings. Updating
mutable files in place would expose mixtures of old and new data to readers.

**Gap:** publication semantics were unspecified. **Reach:** old bundles remain
until deliberately retired. Matrix and catalog use separate renames, not one
filesystem transaction; the runtime catalog is authoritative. **Verdict:**
sound last-good publication without mutable-bundle races. **Confidence:** high.

### 13. Resolve gameplay actions through each appearance's manifest

**When:** action admission and consumer cutover (05/30).
A campaign army requests marching or standing through an appearance's manifest,
the document binding gameplay roles to authored clips. It does not assume every
source calls a clip `walk` or `idle`. Battle reads the same role vocabulary;
manual inspection can still select arbitrary clips. Missing required gameplay
roles reject rather than silently selecting an inspection pose. Hardcoded
renderer name tables would make new assets edit several owners.

**Gap:** consumer naming was unspecified. **Reach:** asset authors own clip
bindings, while gameplay consumers own the requested role. **Verdict:** sound
one gameplay vocabulary. **Confidence:** high.

### 14. Retain synthetic assets only as explicitly selected diagnostics

**When:** placeholder cutover (30).
A material or timing test can deliberately load a block-shaped fixture to
isolate one contract. Battle, campaign and normal model review load the authored
roster instead. A failed production load does not fall back to the diagnostic
catalog. Deleting all synthetic inputs would also delete useful controlled
tests; retaining them as an invisible production fallback would conceal errors.

**Gap:** production placeholder removal did not settle diagnostic retention.
**Reach:** tests must disclose the catalog/workload they measure. **Verdict:**
sound content isolation on shared infrastructure. **Confidence:** high.

### 15. Let the saved fitted source own geometry and accept its real export

**When:** source composition and practical exports (09–28).
Adding an action opens the fitted Blender assembly instead of rerunning an
older generator that might also reshape its helmet or shield supports.
Compatible donor motion is composed around that geometry; deterministic base
reconstruction prevents repeated authoring from accumulating transforms. One
export boundary converts source-forward coordinates and restores editable
coordinates afterward. If a fresh export changes tangents—the surface directions
used with normal maps—the shipped data accepts the actual export rather than
pinning historical bytes. Reduced copies correct genuinely degenerate faces
before admission, not by relaxing the material contract.

**Gap:** source/recipe ownership and export variation were unspecified.
**Reach:** refits are deliberate scoped edits, and the saved source remains
rebuildable; unchanged generator text is not evidence of unchanged fitting.
**Verdict:** sound one editable geometry owner and honest derived data.
**Confidence:** high.

### 16. Match reduced rigs and materials by meaning, not array position

**When:** weighted import and reductions (03/28).
Blender may reorder bones or omit a material whose distant piece disappeared.
Import matches unique bone names, parent relationships and bind transforms
(the reference transforms used to deform the mesh), then remaps vertex indices.
Retained materials must preserve settings, image bytes and sampling meaning,
not their old index. Requiring identical order would reject harmless exports;
accepting any reordered values would hide a different skeleton or surface.

**Gap:** cross-tier identity was unspecified. **Reach:** omission permits
removing unused data, not changing retained material meaning. **Verdict:** sound
semantic identity. **Confidence:** high.

### 17. Use one read-only owner for battle observations

**When:** views, adapter and live verification (05/11/30).
When WebAssembly memory grows, one view owner refreshes the browser's pointers
and counts. One adapter translates injury, equipment, posture and measured
travel; the action timeline decides what animation to play. A diagnostic path
getter reads the same engine counter rather than computing a second movement
history. Letting each consumer interpret raw memory independently would create
several subtly different accounts of one soldier.

**Gap:** observation and diagnostic module boundaries were unspecified.
**Reach:** new observations must retain simulation-owned meaning and correct
memory lifetimes; presentation remains unable to change movement. **Verdict:**
sound minimal ownership. **Confidence:** high.

### 18. Interpret signed travel against the facing the player actually sees

**When:** guarded movement observations (11).
A held-pike soldier can display the unit's frontage instead of his individual
angle. The adapter projects net interval movement against that final displayed
facing, with positive lateral travel meaning right. Packed per-soldier posture
bits report the actual selected-facing branches and incapacity; the pike reads
the branch used by its displayed angle. Using the hidden individual angle could
choose a sideways action that contradicts the screen.

**Gap:** sign convention and posture transport were unspecified. **Reach:**
fresh branch outputs avoid stale guarding flags, but retained facing alone does
not prove a threat or deliberate stepping. **Verdict:** sound consistent basis
without new gameplay states. **Confidence:** high.

### 19. Keep stride and release calibration with existing clip metadata

**When:** distance playback and action baking (05/11/20).
Animating one metre requires knowing the distance represented by one gait
cycle; entering a shot requires knowing its authored release point. Existing
bake metadata supplies those values and admission checks agreement between
local and GPU timing. Standing and combat remain time-driven. A separate
renderer calibration table or a geometry re-export solely to change timing
would create another owner for the same information.

**Gap:** calibration ownership was unspecified. **Reach:** synthetic fixture
rates remain synthetic; they are not calibrated legs or engine speed orders.
**Verdict:** sound one metadata path. **Confidence:** high.

### 20. Start projectile recovery at the engine event and author held-tool visibility

**When:** release and ranged actions (05/20/24/27).
When the engine has already emitted a projectile, the animation enters at its
authored release/recovery point and hides the held projectile. Event age comes
from the engine's own countdown and duration. It does not start a fresh windup
that would imply the shot happens later. Melee tools use authored child-bone
visibility, and rider-only animation masks include those bones. A separate
runtime equipment clock would add competing timing authority.

**Gap:** entry timing and tool visibility were unspecified. **Reach:** a
convincing anticipatory windup needs an earlier truthful engine observation;
animation cannot delay shots or control flight. **Verdict:** sound engine-first
timing without another equipment state machine. **Confidence:** high.

### 21. Do not turn pike readiness into an invented brace-strength clock

**When:** ready/thrust authoring (12).
A soldier holding the hedge selects pike-ready. The engine also has a continuous
brace-strength ramp, but animation does not observe it and therefore does not
manufacture a matching clock. His authored thrust cadence is not a replacement
for the engine's damage interval or weapon reach. Calling a static pose “brace”
and inferring strength from its playback would introduce unsupported mechanics.

**Gap:** the word brace did not settle posture versus strength. **Reach:**
future contact/brace animation requires truthful observations. **Verdict:**
sound separation of posture and mechanics. **Confidence:** high.

### 22. Freeze the composed pose that really existed when an action interrupted

**When:** layered/completed-endpoint timeline (05/11).
A rider can begin shooting at the same observation that corrects the horse's
measured speed. The upper-body transition retains the complete prior composed
source; the unmasked horse follows corrected distance. A whole-body hit or
death retains whole-pose continuity. The special “before” sample means the
latest completed endpoint before its newly observed events, not an arbitrary
history query. Recomputing a saved source from the newly corrected gait could
change the very pose being interrupted.

**Gap:** simultaneous corrections and query semantics were unspecified.
**Reach:** immutable prior ownership keeps one timeline; no extra blend hides
distance correction. **Verdict:** sound interruption meaning.
**Confidence:** high.

### 23. Reload transactionally, reset accepted visual history, and hide partial live uploads

**When:** reload and GPU failure handling (01/04/06/11).
An edited catalog is loaded and prepared separately. If it fails, the old crowd
and history stay in use; if it succeeds, history restarts from current engine
observations, including dead soldiers. Blending across arbitrary old/new rigs
is deliberately not attempted. A normal live update has a different failure
boundary: one skeleton group may already have uploaded when another fails, so
the crowd is hidden until a complete upload succeeds rather than promising old
pixels. Possibly overwritten saved-pose slots are uploaded again. A disposed
world cannot be revived by a pending reload.

```text
replacement fails -> keep old catalog and visual history
replacement succeeds -> publish complete resources; reset visual history
live upload partially fails -> suppress crowd until a complete upload succeeds
```

**Gap:** rollback scope, cross-rig history and publication order were
unspecified. **Reach:** authoring reload loses visual progress, never gameplay
state; this is not a general GPU rollback system. **Verdict:** sound explicit
failure boundaries. **Confidence:** high.

### 24. Let authored death own orientation and explicit life state own corpse effects

**When:** reactions and manual parity (06/13/30).
A falling body follows its authored animation, without an additional random
roll that could push it underground. Corpse recoloring/contact treatment eases
with the existing death transition; a manual dead pose receives final treatment.
Selecting a clip named death in inspection does not itself declare the soldier
dead: life state is a separate input, including mixed-sheet overrides. Treating
the clip name as life state would make review controls disagree with gameplay.

**Gap:** inherited effects and inspection inputs were unspecified.
**Reach:** new fall variations must be authored; the removed variation field
is zero padding in the aligned GPU record, not a hidden behavior channel.
**Verdict:** sound one orientation owner and explicit life state.
**Confidence:** high.

### 25. Review through the production poser with deliberately different framing

**When:** workbench, portraits and sheets (01–30).
A candidate is loaded and reloaded by the production world, not a second viewer
with friendlier materials. Review may hide foliage while retaining ground,
lighting and shaders. A body portrait frames the person; a full-kit sheet shows
the long weapon. Motion-sheet cameras fit the union of posed geometry across
exported keys and review samples, then stay fixed instead of breathing as the
weapon moves. Existing decoding/skinning supplies the geometry. Crops preserve
real pixels rather than deleting colors that could also belong to skin or gear.

**Gap:** scenery and framing were unspecified. **Reach:** portraits do not
certify full weapon clearance, nor isolated sheets battlefield occlusion.
Manual pose edits exit replay; camera edits preserve it. **Verdict:** sound
shared posing with explicit review scope. **Confidence:** high.

### 26. Give a prepared appearance complete, disposable surface ownership

**When:** material import and reload (04).
Material slots can read regions/channels of one appearance image set. Competing
images for the same channel reject instead of being silently combined.
Embedded binary/data-URI image bytes survive import; external references reject,
and browser decoding decides final codec validity. An absent map gets a neutral
binding, but a declared map that fails never does. Images load sequentially and
share prepared resources only inside that preparation's disposal lifetime.
Explicit sampling stays authored; omitted sampling follows glTF loader defaults.

**Gap:** grouping, codecs, defaults and cache lifetime were unspecified.
**Reach:** parallel loading or live editing must preserve cleanup; mutating a
JavaScript array is not a GPU editing API. Missing faction-marking attributes
mean unmarked geometry, but malformed present attributes reject. **Verdict:**
sound failure/resource ownership instead of silent repair. **Confidence:** high.

### 27. Reject unsupported source math and bound more than endpoint poses

**When:** weighted import and GPU admission (03–06).
A nearly valid rotation can become invalid after conversion to GPU floats.
Admission checks near-unit rotations in both representations, affine bind
transforms, packable normal scales and mapped directions through the existing
bounds scan. The established weighted-normal rule has a geometric fallback at
an interpolated collapse, not permission to admit broken source. Conservative
hierarchy-based bounds cover unsampled turns/blends that endpoint boxes miss.
Silently normalizing arbitrary bad data or using only visible endpoint boxes
would conceal unsupported inputs.

**Gap:** supported math and bounding method were unspecified. **Reach:**
exporters must satisfy the domain; conservative spheres can retain off-screen
work and must not silently enlarge review framing. **Verdict:** sound explicit
domain over hidden repair. **Confidence:** high.

### 28. Choose visible detail separately for the eye and the shadow

**When:** projected detail planning (07/15).
A soldier outside the camera can still cast a shadow the player sees. One
planner considers both audiences, allowing the eye to use a far image while
the sun uses a mesh. Both share one pose slot, but a far image does not cast a
mesh shadow. Separate resource owners prevent one audience from retiring the
other's buffers. One merged visibility/distance shortcut would lose legitimate
shadows or draw unnecessary eye geometry.

**Gap:** visibility requirements did not choose this split. **Reach:** future
level-of-detail work must preserve both audiences and count both geometry costs.
**Verdict:** sound visibility ownership. **Confidence:** high.

### 29. Reuse only exact work and respect the renderer's real resource lifetimes

**When:** bounded runtime work (06/07).
Two identical interruption requests in one update can share a frozen result;
different phases or appearances cannot. Recording observations does not build
playback that will immediately be discarded. Packing reuses cleared private
scratch and stable worklists, while returned planner results remain independently
owned. Compute-only storage is retired through the pinned Three attribute cache
after its consumers, rather than pretending geometry owns it. Timing failure
stops allocating queries instead of producing stale success.

**Gap:** optimization and framework boundaries were unspecified. **Reach:**
there is no pose quantization; framework upgrades must revalidate cleanup, and
bounded reuse is not a promise that irregular crowds meet the budget.
**Verdict:** sound exact reuse with explicit dependency cost.
**Confidence:** high.

### 30. Separate numerical equivalence from identical-input image repeatability

**When:** material and animation comparisons (04/06/11).
Equivalent CPU/GPU calculations can move a silhouette by a minute amount and
change an edge pixel. The numerical check independently bounds actual GPU
transforms. The image-consumption check then uses validated transforms and
matching position arithmetic, with same-input repeats and a same-palette
control (the same prepared joint matrices). Event checks separately retain
exact local interruption sources. Isolated comparisons start with equal shadow
and visibility history; continuous tests preserve their history. One loose image
tolerance would mix these distinct claims and could conceal a real defect.

**Gap:** a math tolerance did not define a raster criterion. **Reach:** neither
arbitrary bad pixels nor looser ordinary baseline repeats are authorized.
**Verdict:** sound independent proofs rather than a circular reference.
**Confidence:** high.

### 31. Make verification timing, subject and workload explicit

**When:** production verification (01–30).
A pose assigned twice within one browser frame may leave old post-processing
content, so a capture waits for the real settled draw instead of retrying until
pixels happen to match. Far inspection first obtains real projected admission,
then magnifies it. A filtered run covers only its requested images, and a
body-region check does not certify the excluded interface. A battle fixture that
requires orders at tick zero freezes through the existing debug API when the
game is published, before its first frame; waiting for catalog readiness would
let the simulation advance before setup. Functional startup and workbench reload
waits allow up to 60 seconds for their unchanged success predicates. These are
bounded liveness checks, not loading-speed or frame-time guarantees; extending
them does not retry a failed snapshot. Synthetic cost fixtures use referenced equivalent detail,
not unused bones, and detailed benchmarks remain distinct from gameplay's reduced meshes.

**Gap:** fixture scheduling and measured subjects were unspecified.
**Reach:** camera, mapped vertices, controlled rider joints and workload must
remain declared; paused/synthetic tests cannot certify full live performance.
**Verdict:** sound separation of scopes without changing raster or frame-time
thresholds. **Confidence:** high.

### 32. Share weighted GPU encoding and narrowly bounded rotation math

**When:** weighted meshes and GPU interpolation (03/06).
An elbow keeps all four contributing bones rather than dropping weights to fit
a device's vertex-input limit. Both renderers use the same packed layout.
Rotation blending takes the shorter turn between orientations and uses the same
bounded angle/sine calculation, because GPU built-ins permit more error than
the pose contract. Different layouts or looser built-in interpolation would
make the renderers disagree about the same authored motion.

**Gap:** encoding and interpolation were unspecified. **Reach:** new channels
extend the shared owner; extra arithmetic/storage belongs in the measured
workload. This is not a general replacement math library. **Verdict:** sound
consistent deformation and numerical meaning. **Confidence:** high.

### 33. Preserve body continuity only across exactly compatible equipment rigs

**When:** equipment continuity (14).
When the engine exchanges a pike for a sword, the sword appears on that same
observation. If both assets have identical bone names, hierarchy and bind
transforms, the body starts from its previous composed pose and uses the
existing short blend toward the new action. Old clip indices never enter the
new asset; different skeletons reset. Snapping every body or implementing a
general skeleton remapper plus authored draw/sheath choreography were the
alternatives.

**Gap:** safe pose reuse across equipment bundles was unspecified.
**Reach:** skeletal continuity does not make weapon geometry continuous—the
sword initially follows the previous hand pose. No extra weapon, switch clock
or simulation authority is added. **Verdict:** sound reuse of identical local
spaces within the existing timeline. **Confidence:** high.

### 34. Preserve main's steering reuse when observing model motion

**When:** integration with main after model delivery (2026-09-09).
At the start of a tick, the model code clears the observations that say whether
a soldier moved under their own control and whether they retained a guarded
facing. Main also reuses the storage holding each unit's steering inputs and
measurements. The merge keeps both: observations reset every tick, and the
existing buffers are filled and returned through main's single steering path.
Choosing either parent's whole conflicting block would either lose those
observations or discard the completed allocation optimization.

**Gap:** both branches changed steering startup independently. **Reach:**
rendering can observe movement without restoring per-tick buffer allocation.
The observation test helper uses main's in-place precomputation API; its
assertions and the simulation's golden hash are unchanged. **Verdict:** sound
preservation of both owners' contracts. **Confidence:** high.
