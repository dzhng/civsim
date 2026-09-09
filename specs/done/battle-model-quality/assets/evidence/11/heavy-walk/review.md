# Equipped heavy ready/walk — working candidate

Locally authored on a frozen fitted heavy, using the existing rig and production
skin/material/environment path. No geometry, weights, bind hierarchy, sim speed,
runtime controller or IK changes. This is not11 acceptance.

## Frozen comparison and authoring choice

The original fitted source hash is
`8e8929d51068411671f354621ad57b07d47d1c083f031d6793c5f605f28376d7`.
[Source integrity](source-integrity.json) compares that exact Blender input with
the motion source: vertex positions, polygons, weights and bind matrices match.
The kit predates some concurrent anatomy/garment refinements. Those refinements
must be re-baked and rechecked with the clips; do not silently treat this as the
latest merged appearance. Shared bend/pronation actions remain present.

Ready lowers the arms into controlled sword/shield carriage with a small torso
lean and planted soles. It is a static stance, not a breathing-idle performance.
Walk uses0.765m steps at120 steps/min: a1.53m/s target matching the current heavy
default march pace, rather than the rejected slower short-stride inspection trial.
An offline limb construction sets authored knee lift, heel/flat/toe pitch and
support-foot travel. Pelvis height follows the supporting sole in the authoring
scene; runtime receives only ordinary joint keyframes with no horizontal root
translation. The foot floor assertion checks both soles at every authored frame.

The first short-stride trial established carried equipment but was not retained
as the walk target. Actual-speed stride and cadence were changed together rather
than merely accelerating the short-step motion. Knee timing was adjusted to keep
the swing sole above ground during the heel/toe transfer.

## Read the sequence

[Ready](ready.png), [front](front-frames.png), [side](side-frames.png),
[rear](rear-frames.png) and [three-quarter](three-quarter-frames.png) show the
retained candidate. Sheets contain all31 frames from0 through30, six columns,
in reading order; unused final tiles are black. Individual `frame-XX.png` files
are native side crops. [Feet detail](feet-2x.png) enlarges the300×220px regions
at(160,360) in frames0/7/15 by2× nearest-neighbour.

The [real-time side GIF](side-realtime.gif) samples every third captured frame
at100ms each for an exact one-second cycle. [Slow side GIF](side-slow.gif) shows
all30 unique frames at100ms each. Front/rear/three-quarter derivatives use the
same timing. GIFs are review derivatives of deterministic `snapCheck` captures,
not separate render paths. Pose0 and30 include the loop closure.

Direct still inspection: frames0–5 transfer weight from heel contact into a flat
support while the other leg lifts;6–10 pass the bent swing leg under the body;
11–14 extend it toward contact;15–29 mirror the support exchange;30 returns to0.
Sword and shield remain controlled. Upper body changes little beyond bob and
small shoulder motion, so this remains a basic loaded march rather than polished
whole-body locomotion. The one-second cadence has deterministic timing metadata;
the fresh visual reviewer could not play GIFs and did not certify cadence from
static images alone.

## Measured boundaries

[Grounding](grounding.json) samples every authored frame in Blender. Minimum sole
height is about-0.000000057m (floating-point scale); no meaningful floor penetration
is measured. Flat-support sole-center world drift is about5.03mm over each flat
interval after subtracting1.53m/s motion. Heel/toe roll intervals are not included
in that center-based sliding claim. Pelvis excursion is7.1cm; maximum swing sole
clearance is12.2cm. These are telemetry, not proof of realistic weight.

No sampled sword-blade vertices lie inside the naked body; nearest sampled blade
vertex distance is12.5mm. This is not continuous triangle collision proof or
accepted grip contact. Shield long-axis tilt stays about28.7°. Existing thumb/grip
intersection, garment stiffness and thin limb shapes remain their prior owners'
unresolved defects.

The production scene captures all31 frames from four bearings and repeats every
tile byte-for-byte. Original static geometry sheets remain unchanged. A ready
baseline from the earlier authored-leg-length trial differs by950 pixels and is
not silently reblessed; the final ready actual is archived here. Newly created
walk baselines are unaccepted and not committed. The candidate baker `--check`
passes against the exact captured GLB. Re-export can vary a few tangent components;
positions, weights, bind and animation arrays remain unchanged. The captured GLB
is retained; binary Blender-export reproducibility is not claimed.

## Fresh review and remaining work

The unprimed reviewer inspected every consecutive frame in all four sheets and
native selected side frames. Verdict: **usable working candidate**, no further
motion iteration required before proceeding, not final art acceptance. It found
plausible alternating support, consistent endpoints and controlled attached
equipment, but high-confidence stiff torso/shoulders and angular knees; medium
confidence flat-looking feet. Ready is balanced but upright/neutral, not strongly
braced. Shield occlusion limits contact judgment; world sliding cannot be inferred
from the in-place images. Native frame evidence replaced an initially clipped
detail crop, which was then corrected.

Independent CLI code review was attempted and blocked by its installed version
rejecting configured `gpt-6-astra`; no upgrade or model override was made. This is
not a passed CLI gate. A separate read-only source review found no actionable issue:
owned action replacement preserves inspections, unrelated names fail explicitly,
root translation remains zero, and walk endpoints match within3.1e-18 component
error. The floor check covers authored samples, not every interpolated instant.
Default static helper coverage is retained; one additive named
scene supplies equipped ready/walk timeline details. No alternative runtime was
introduced.

## Integration

Import the motion authoring module, call `author_motion(arm, scene)` on the fitted
heavy scene after gear assembly, then call the existing shared export. Mark ready
and walk as looping when baking. Alternatively run its Blender script with
`-- --source <frozen-heavy.blend>` whose rig already owns shared inspection clips.
The saved motion source is self-contained and is the default regeneration input.
Use `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5177 node web/scene.mjs heavy-motion`
for this candidate. Recheck after anatomy/gear/material integration; actual speed
ramp, run, transitions and phalanx locomotion remain later work.
