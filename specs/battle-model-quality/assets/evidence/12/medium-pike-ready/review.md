# Medium held-pike ready — bounded pose study

This is an authored held-hedge ready pose, **not** an observed brace-strength
state. The simulation remains canonical. No thrust, live binding, new state,
timing change or final combat-motion acceptance is included at this checkpoint.

## Semantic boundary

The weapon owner in `crates/sim/src/combat/run.rs` holds the hedge along unit
frontage and selects the sidearm for a close foe that the pike cannot take.
The adapter's `pikeReady` reports that held weapon; `atEase` still wins standing
selection. The separate continuous effective-mass ramp in `Unit::brace` is not
an action observation and is not inferred here. `fighting` is engagement range,
not a precise strike event. Authored thrust timing must not become the engine's
damage cadence when that later study is bound.

MediumPhalanx is engine class14; HeavyPhalanx is class3. The manual candidate's
key14 coincides with the medium class but belongs to a separate manual catalog.
The source registry, not an old render-name table, determines that identity.

## Frozen source and pose control

Starts from medium-run commit42f9cd46, fitted source SHA256 Blend
`853a857206a732983e8ee46090ef8752b78ca9efe667b7c49e691e21299cdd87`, GLB
`5dbaf26fcce511b69b7b21bb7ac34e9a6bf28622eeb29edceaf2f15fe2e3ae95`.
Never rebuild from a current heavy donor. All seven existing clips, rig and
geometry remain controls; the new pose is an additional manual looping clip.

The saved `pike-carry` is connected forward-pike geometry: two purchases 0.34m
apart forward and 0.12m apart vertically, shaft19.44° above horizontal. It is
not an upright safe-carry pose despite its generic name. The inherited `ready`
has the left purchase about699mm off the shaft and is not valid medium ready
content. Neither existing clip is overwritten.

## Iterations and current limits

Initial A re-solved the arms after lowering the body. Grip/support numbers passed
but the rear elbow visibly folded/corkscrewed; main and root rejected it before
motion authoring. A Blender setup failure before this export returned process0
despite a Python exception; the absent artifact/log, not exit0 alone, rejected it.
An initial export also omitted the new action until its owned muted NLA strip
was added; the imported-clip control caught that missing output.

B preserved both arm chains together and loaded the common trunk/legs. All eight
imported clips and rig reproduce exactly when reauthored. Fresh critic9862 loaded
both actual sheets and preferred B to the forward control, but found a crouch
with limited forward loading and pinched knee silhouettes. It is not an accepted
base. Hidden hand/torso clearance remains unresolved. A static triangle probe
found no scabbard/lower-leg or shaft/butt/lower-leg surface crossings; that does
not establish other contacts or continuous motion.

C keeps the connected arms and changes support only: a modest common trunk
inclination, slightly narrower feet, clearer fore–aft stagger and pelvis over
the support. The foot-derived bend direction equals the existing forward axis;
it must not be represented as an independent knee-direction correction.
CPU controls preserve all prior clips/rig/non-tangent geometry, static endpoints,
submillimetre grip-marker and flat sole support. Source tangents remain unpinned;
the full old-image gate is still required.

Fresh C comparison55086 inspected all four B/C sheets and both 2× support
crops (six actual image payloads in session01a07de0-0e8b-7d93-b903-45fbc484d5c5).
It moderately prefers C's flatter, more deliberately presented pike, but does
not find convincing improvement to weight distribution. Both remain somewhat
upright/seated with a flared rear elbow and crowded hand/shield/waist silhouette.
The forward arm is obscured; apparent shaft/shield and hand/hilt crossings do
not establish penetration. Neither these images nor the grip marker prove
hidden hand contact. Full-pike sheets retain both endpoints; whole-body sheets
intentionally crop the long shaft and must be read with the complete views.
The C support crop nearly reaches the helmet edge; original full sheets remain
the framing authority. Parent reviewed all eight C panels and the complete
critique: retain C provisionally as held-pike ready, not resolved support,
brace or hand-clearance work. No further static micro-iteration; a later thrust
must demonstrate connected leg/torso loading. Only these two new static
baselines are approved; the normal358 gate still must preserve all old356.

C repeat authoring reproduces all eight imported clips and rig exactly. The
editable source preserves all 63 mesh hashes, rest rig and seven old action
curve hashes. Its static lower-body triangle probe finds zero surface crossings
against the scabbard and pike shaft/butt; nearest sampled vertex-to-opposing-face
distances are 95.17mm and 483.94mm respectively. This checks one static pose,
not hidden arm/shield contact, solid containment or continuous motion. The
shared probe's historical “two sampled times” report wording does not apply
here: its single row is frame0.

Capture44819 exits1 solely for the two expected differences against rejected A
auto-created snapshots; all production pose and exact repeat checks pass, with
no page errors. Those A files are not an approved baseline. Old356 capture
coverage has not yet been rerun on this source. No GPU capture overlaps bake.

## Ownership and choices

The existing medium motion recipe owns the added pose and regenerates it from
the saved connected forward pose, never previous loaded offsets. The current
manual scene adds opposing whole-body and full-pike comparisons through the
existing sheet helper; no parallel renderer, controller or pose evaluator.
The unchanged existing captures keep their order, with new sheets appended.
Body loading amounts are provisional art choices, not engine brace parameters.
Geometry/finger edits and force/cadence observations stay outside this pass.

### Choice self-audit

- **Provisional body-load amounts — sound, medium confidence.** With no engine
  brace observation to imitate, the pose uses a restrained forward trunk and
  staggered planted feet. A stronger crouch was rejected and C retained after
  comparison. These are editable art choices, not physical calibration; future
  thrust review may replace them without changing simulation behavior.
- **Copy the existing connected pose — sound, high confidence.** Reauthoring
  begins from `pike-carry`, replaces only the owned new action and its export
  track, then applies loading once. Editing the previously loaded pose would
  accumulate offsets on repeated runs. Exact repeated clips verify the chosen
  saved-source ownership. The original imperfect carry remains a control.
- **Two complementary sheets — sound, high confidence.** Whole-body framing
  reveals support and arm shape but cannot fit the long pike. A second wider
  sheet checks both endpoints. Using only the wider shot would hide the joints;
  using only the close shot would leave pike extent unreviewed. Neither proves
  hidden hand/shield contact. The existing shared scene owns both views.

### Focused review

Shape review: 45 added/4 removed recipe lines, one loop-list addition, 28 scene
lines; no parallel authoring recipe, runtime or render helper. Fresh code
review26451 reports no concrete defects and independently verifies old baked
clips plus candidate `--check`. Its Blender startup crashed under the read-only
sandbox before reauthoring, so it makes no independent source-repeat claim.
The main background-Blender repeat and editable controls provide that evidence.
Six existing animation/pose/basis/tangent/bounds/presentation suites pass, as
does the candidate bake check. No unit test assertions or simulation stats move.

### Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `pike-ready-whole` shared sheet | No committed ready comparison; iteration A auto-created a rejected pose | Original forward control plus C from two opposing close views | Additional provisional held-pike pose; both C panels preserve connected arms rather than A's re-solved elbow. **moved** |
| `pike-ready-complete` shared sheet | No committed complete-pike ready comparison; iteration A was rejected | Same control/C pair from both sides with both pike endpoints in frame | Verify the full weapon that does not fit close framing. **moved** |

All prior356 snapshots and their draw arithmetic remain unchanged. No image
tolerance, gameplay timing, state, live binding or renderer arithmetic changes.

## Final checkpoint verification

Scoped update30018 refreshes only the two parent-approved C sheets. Normal
full358 run91414 then passes **1,178 checks, 358 snapshots, zero failures and
zero page errors**, including all356 original images exact and shared per-pose
or per-frame exact repeats. Source tangent differences therefore cause no old
pixel change in this full coverage; this is not universal tangent equivalence.
The first update attempt77895 mistakenly set `UPDATE_SNAPSHOTS` instead of the
shared owner's `UPDATE_SHOTS`; it changed no baseline and correctly remained
red against rejected A. It is a configuration error, not an accepted run.

The Preview open request returned success at22:00:25UTC, but subsequent
AppleScript checks found no documents/windows. Visibility for the attempted
five-minute human checkpoint is unverified; no endorsement is inferred. The
window-close command completed at22:05:35UTC with zero windows confirmed.
GPU run91414 finished and was explicitly released before any source work resumed.

Final editable source SHA256:
`53758342b01e89c947db064f37ca56f720ad302254bd6c6550fbf544d0c98dda`.
Export SHA256:
`5761a545f9129e20b309b2265224bc489a64ccfc5af77ea1d117eab93d5390d6`.

Reauthor with isolated background Blender on the saved fitted source using
`blender-medium-motion.py -- --clip pike-ready --output DIRECTORY`.
Do not invoke the original heavy-dependent geometry builder.

Focused commands from the worktree root:

```sh
node packages/soldier-assets/bake/medium-phalanx.mjs --check
node packages/soldier-assets/bake/local-animation.test.mjs
node packages/soldier-assets/bake/local-pose.test.mjs
node packages/soldier-assets/bake/engine-basis.test.mjs
node packages/soldier-assets/bake/posed-tangents.test.mjs
node packages/soldier-assets/bake/animated-bounds.test.mjs
node packages/soldier-assets/bake/presentation.test.mjs
VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5417 node web/scene.mjs medium-phalanx
```
