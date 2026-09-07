# Guarded backward-walk candidate

Candidate only; fresh visual acceptance and live integration remain pending. No
runtime clip selection, simulation movement, existing action, hand fitting, mesh,
or rig edit is included in this commit. The source adds one original
`guarded-backward-walk` action to the reviewed wider ready donor. Parent integration
must copy only that action into its combined source.

## Motion contract

Conscious retreat keeps the threat-facing shield forward. This is neither a
reversed forward clip nor a hit/knockback response. Offline leg construction places
each foot through a low backward recovery arc and overlapping support; there is
no runtime IK. The fitted ready arm chain stays connected while pelvis and trunk
respond subtly to alternating support. Fine hands are inherited unchanged.

Engine movement is authoritative. The inspected ordinary near-threat Move path
uses the walking base speed and backward drift factor even with ordered Run:
nominal straight-backward speed is 1.7 × 0.55 = 0.935 m/s. The archived seed-71
fixture uses ten heavy men per side, 12 m separation and 180 settling ticks.
`engine-motion.json` records 450 subsequent ticks, individual position/facing,
posture, velocities and unit state at 1/30 s. Ten men avoid the remnant-route case.

The visual fixture uses the actual men-centroid vector trace over ticks 301–361:
2 s, 1.832220 m backward and 0.008793 m lateral, averaging 0.916110 m/s backward.
All men are guarded and conscious throughout this window, with no routing or
engagement. This centroid is **not proof of individual self-propulsion** and is
not the unit frame-speed field. `measured-travel.json` preserves all 61 vectors.
Production instance displacement interpolates these vectors; clip phase follows
longitudinal distance divided by the authored 0.916110 m cycle distance. The new
action lasts 1 s; the existing run and walk durations remain untouched.

## Evidence and limits

`capture` contains 80 full production PNGs, two 20 fps review GIFs and submitted
instance/animation states. Each view spans 0–1.95 s, two cycles sampled at 0.05 s.
All 80 frames were immediately repeated exactly in pixels and submitted state:
241 checks, no page errors. The fixed camera/floor makes actual displacement
visible; `motion-review` contains all frames in chronological strips, without
selecting favorable poses. GIF end-to-start displacement resets the fixture.

Author inspected both whole contexts and all ten strips. The gait reads as
deliberate retreat with a forward shield and low foot recovery, but the chest,
shoulders and head remain notably upright and restrained. This is an author
observation, not fresh acceptance. No claim of resolved visual quality is made.

`guarded-v2.json` samples imported production skinning at 240 Hz with constant
authored mean translation. Fully foot/toe-weighted sole vertices within 2 mm of
rest floor give minimum sole Z −0.395 mm and flat-window longitudinal center drift
0.299 mm (foot-local phase 0.10–0.45). `recorded-floor.json` separately applies the
captured distance-driven phase and measured root trace: minimum sole Z −0.394 mm,
longitudinal flat-window drift at most 0.296 mm, lateral drift at most 3.026 mm.
Contiguous support windows are measured separately; no across-cycle reset is
counted as sliding. These are geometric fixture checks, not sim contact forces.

The initial 7.5 cm swing arc intersected the lower shield with the left knee.
The retained 4.5 cm arc removes that sampled intersection. `contact.json` checks
61 half-frame source samples across sword/shield/body/tunic/mail/helmet/sole
surface pairs with no detected overlaps. BVH surface tests do not establish
containment, all possible pairs, or all runtime interpolation times.

`controls.json` asserts exact existing source-action key coordinates, handles and
interpolation. `guarded-controls-v2.json` confirms the imported rig and all seven
old clips are exact. Positions, skin weights, indices, normals and other mesh
fields remain exact; two primitives have only tiny exporter tangent rounding.
Reviewed GLB SHA-256:
`4d88ce87629273a83970d4264fffad3f4d70d7ba16a50860a40c73ac2d973f4c`.

## Local reproduction

Durable authoring is in `packages/soldier-assets/bake/blender-heavy-guarded-backward.py`.
One-off measurement, capture and contact probes remain in the isolated worktree's
ignored `throwaway`; their outputs are archived here, not promoted as parallel
verification infrastructure. Run from `/Users/david/dev/game-heavy-guarded-backward`:

```sh
node throwaway/measure-backward.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python packages/soldier-assets/bake/blender-heavy-guarded-backward.py -- --source /Users/david/dev/game-heavy-idle-motion/throwaway/heavy-ready/source/candidate/heavy-motion.blend --output /Users/david/dev/game-heavy-guarded-backward/throwaway/guarded-backward/source --speed 0.9161101579666129
node throwaway/bake-backward.mjs
VERIFY_GPU=1 VERIFY_URL=http://localhost:5269 node throwaway/capture-backward.mjs
node throwaway/backward-strips.mjs
node throwaway/backward-foot-contact.mjs throwaway/guarded-backward/source/heavy-guarded.glb guarded-v2
node throwaway/backward-controls.mjs /Users/david/dev/game-heavy-idle-motion/throwaway/heavy-ready/source/candidate/heavy-motion.glb throwaway/guarded-backward/source/heavy-guarded.glb guarded-controls-v2
node throwaway/backward-recorded-floor.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python throwaway/backward-contact.py
```

The floor/control probes refuse to overwrite existing labels; choose a fresh
label for reruns. Capture uses the shared production candidate-sheet route and
snapCheck on isolated Vite 5269 with SwiftShader; serialize GPU use and wait for
candidate baking before capturing. The source `.blend` and `.glb` remain in
`throwaway/guarded-backward/source` for parent action transfer.

Self-review: source/action ownership is bounded, recipe is under the existing
authoring owner, one-off probes stay scratch, and speed inputs reject nonfinite or
nonpositive magnitudes. No tests or gameplay behavior changed. Independent code
and fresh visual review are explicitly deferred to parent after this lane ends.
