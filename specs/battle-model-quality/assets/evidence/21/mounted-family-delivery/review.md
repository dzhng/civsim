# Mounted family delivery — source pass in progress

The usable-family priority supersedes further shoulder polish. This pass owns an
original horse/tack source and a seated fitted-human rider for shock cavalry,
its sword appearance, and horse archers. It does not change the engine, introduce
dismounts or ragdolls, or adopt the rejected shoulder reconstruction.

The saved fitted human is reused, not regenerated. Its named articulated upper
body remains available to the existing rider-only action mask. Horse body and
four independent leg chains, rider pelvis and seated legs remain in the base
motion. A shared source owner supplies finite equipment variants; no random
per-soldier kit or second mounted controller is introduced.

Original rounded barrel, withers, croup, neck, head, muzzle, legs, hooves, ears,
mane and tail establish the whole horse before small detail. Leather saddle,
girth, bridle and reins explain the rider/horse relationship. The source faces
the established authoring -Y direction and uses the existing native export.

Walk has four separate footfalls; canter has hind, diagonal pair, leading fore,
then suspension. The gait reference is the National Cooperative Extension
[walk](https://horses.extension.org/horse-walk/) and
[canter](https://horses.extension.org/horse-canter/) descriptions. Authored stride
distance is a source measurement, not a change to engine speed. Completed roles
must include actual mounted idle, ready, walk, run, hit, death and appropriate
melee/release; a release marker remains presentation metadata, not damage timing.

CPU gates precede a queued short turnaround/seat/hoof capture. Full motion and
formation evidence follows a readable source: complete gait cycles, upper-mask
combat while horse travel continues, and nonloop death hold. No current source
or visual acceptance is claimed. Root owns final integration and broad gates.

## Initial construction controls

The first source exports 43 bones and 65,332 vertices across the merged draw
mesh, with editable components retained. Idle/ready, four-beat walk and canter
are actual keyed source actions. The first bake succeeds through the production
importer, animation sampler and material bundle. Equipment remains the donor's
temporary heavy sword/tall shield; it is not yet the mounted appearance.

An imported/baked 49-phase check gives minimum visible vertex heights of +5.00mm
for ready, +3.40mm for walk, and **−3.94mm for run** at phase .22917 on the right
hind hoof. The latter is an unresolved interpolated hoof-path defect; the first
construction sheet deliberately shows only ready/walk, not run acceptance.
This is a sample-based vertex measurement, not a continuous triangle/contact
proof. No floor waiver is being made.

## Complete-family CPU checkpoint

The next source supplies the actual round-shield/lance cavalry, matching sword
appearance, and cap/leather bow rider. Shared fitted-equipment authoring owns
the round shield, atlas material change, crest and clip-owned held sword. The
horse now has separate elbow/stifle, carpus/hock, cannon and hoof segments;
coarse shoulder support weights blend into the barrel. Bridle, reins, eyes and
girth are original source geometry. This is not anatomical art acceptance.

Seven cavalry actions and eight bow-rider actions are authored. The bow string
draws toward the right palm and releases at the authored .6 marker in a 1s
clip. The engine still owns when a release event occurs. The existing melee
role reveals the fitted sword through the shared child-bone visibility rule;
the scabbard is retained. Upper masks include the string and held sword, but
exclude the horse, rider pelvis and seated legs.

The initial rolling fall pushed hooves and held equipment below the plane. It
was rejected on CPU. Offline supported hoof trajectories, relaxed equipment
orientation and rider-leg folding replace that raw roll. Full exported/baked
121-phase checks now find minimum vertices above the plane in every action of
all three sources: lowest body sample +4.48mm during death. This is still a
sampled envelope, not a claim that all triangles or contacts are continuously
proven. The traveling hoof targets include an explicit 8mm conservative sole
clearance for the fixed-rate local-angle interpolation; exact foot planting is
not claimed.

The actual-source consumer test rejects an upper mask containing mount-body,
then passes after restoring the proper mask. Horse and seated-base world
matrices remain exact while the weapon hand changes. A stale doubled stride
metadata mutant is also red: the exported support hoof moves .269632m over the
selected .2-cycle interval, consistent with the authored 1.35m cycle within a
2mm interpolation tolerance. Loop endpoints close and death sampling holds the
terminal pose. These establish source/runtime contracts, not visual quality.

Initial eight construction poses and immediate repeat were terminal0 with
zero differing pixels. A fresh neutral critic identified the bulky-to-thin
limb relationship, wedge muzzle and unclear seat as the main construction
gaps. One large-form/equipment completion pass follows; no per-piece polishing
loop is authorized. Candidate presentation remains manual-only at this checkpoint.

## Equipment checkpoint and bounded correction

Twenty complete-kit poses and their immediate repeat passed exactly (capture
23529, repeat93264; browsers closed). All twenty were inspected. Fresh neutral
review identified the steeply elevated lance during melee as a functional
role error, and the rider's fallen pose as a toppled seated assembly. Bow draw
was readable; unclear string purchase and angular horse form remain visual
limitations, not demonstrated detachment. These stills do not prove motion.

The B Blend/GLB sources, recipe and six sheets remain frozen in the isolated
study's `throwaway/mounted-family/coarse-b`. C orients the connected lance
forearm using the actual saved shaft axis, and adds differentiated chest yield
to the fall. It does not regenerate anatomy, change gameplay or introduce a
dismount. Shared equipment composition now owns both the export and the
clip-keyed sword visibility, rather than a second mounted export implementation.

C's three native source checks preserve all26 translated human bones and
31/35/27 retained component meshes respectively, including original topology,
UVs, materials and weights except the explicit held-sword joint. All actual
source mask/stride/loop/terminal-hold tests remain green. Imported121-phase
floor checks remain positive in every clip, with minimum+4.48mm at the mount
body. The unchanged sampled envelope is not support or continuous-contact
acceptance. C awaits the same bounded visual checkpoint before full cycles.

The independent technical review found stale elbow-volume keys, duplicated
stride declarations and a terminal test that merely sampled clamped time.
All three were corrected before C capture: the existing fitted elbow bisector
calculation follows each new arm pose; Python authoring and JS bake read one
stride declaration; death contains a real final .2s authored hold. The new
distinct-time hold test fails on the prior source, then passes within1e-6 export
precision (maximum observed local component roundoff1.79e-7). It no longer
claims settling from out-of-range sampler clamping. Baked nonloop metadata is
checked separately at final admission. No gameplay timing changed.

## Usable source retention

Corrected twenty-pose capture and immediate repeat both passed exactly
(session33401; both reports terminal0, pages closed). Main inspection covered
all six sheets/all twenty poses. The fresh unprimed review found no definite
functional blocker for a completion-first family. Lance ready/effort distinction,
bow/sword crowding, angular horse joints and rider separation in the fallen
silhouette remain follow-ups; soft ground cues do not prove floating. These
findings do not justify further source iterations under the user's priority.

The final source folder retains the fitted rider inputs, complete editable
assemblies and independently reduced mid/far sources. Its recipe consumes the
shared fitted equipment exporter and visibility author, not a parallel runtime
equipment system. The complete role binding uses the existing mounted mask;
the final bake's role validator rejects missing, static or incorrectly looping
required actions. All three death metadata records are nonlooping2s clips.
The shared far owner chooses ready for its atlas; separate skinned mesh tiers
are genuinely reduced and retain exact rig/actions/materials.

Both gait support intervals are now measured against actual exported geometry:
walk .269632m over .2cycle and canter .322829m over .09cycle, within2mm of their
shared authored stride values. Native fitted controls and all three LOD controls
pass. The final technical review reports no remaining concrete source/bake/test
or scene-wiring defect. Full web382tests/62files and typechecking pass; the only
initial suite failure was a sparse-excluded committed campaign fixture, restored
without changing assertions.

The final motion evidence is deliberately eight evenly spaced samples per
cycle, opposing whole-body views and a terminal death hold, through the existing
candidate-sheet production poser. It is a bounded visual sanity check, not
continuous collision proof or a simulated mounted-combat claim. Full-rate
footplant realism, refined anatomy and equipment-rest silhouettes are follow-up
quality work rather than completion blockers.

The initial reduced mounted tiers are not a performance admission. A separate
shared hardware gate found the retained high-detail near tier too expensive at
crowd scale. The runtime mesh-budget owner may further reduce near/mid/far
without regenerating these editable originals or changing their actions; root
owns that adoption and its consumer verification.

Final capture and exact repeat (session44163) both terminated0 with browsers
closed: all13sheets,134poses, including114 motion samples and20 retained static
controls. Every ordered motion pose was inspected. The fresh neutral motion
review found coherent walk/run progression and a complete readable lateral death,
with no demonstrated functional blocker. Subtle lance/hit/release, steady rider
posture and largely coupled horse/rider falling remain documented refinements.
The review does not certify exact real-time cadence, contact or continuous
collision clearance. No additional source round followed it.

Review GIFs are derivatives of the exact gated crops using the existing encoder,
not a new animation harness. Looping gait frames repeat twice; death holds its
last sample for approximately5s. GIF centisecond timing is rounded and player
dependent, so these are review aids rather than timing authorities. Original
PNG sheets remain the exact gate. The final unchanged-source bake check passes;
the isolated Vite server and all browsers are stopped.

### Change ledger

- New actual-source mask test: no earlier mounted fitted source existed; a
  mount-body-in-upper-mask mutant fails, proper upper action preserves horse
  and seated lower-body matrices while moving the weapon hand.
- New stride tests: exported hoof travel must match the same interval's declared
  walk/canter stride. A doubled walk metadata mutant fails; shared declaration
  removes independently editable authoring/bake distances.
- New terminal test: the initial clamp-equality assertion was replaced by
  distinct authored late times. Old moving-tail source fails; final held source
  passes at export precision. Required nonloop ownership is checked by bake.
- No existing simulation, controller or gameplay assertions changed. Exact
  static snapshots are new mounted-family evidence, not changes to prior families.
