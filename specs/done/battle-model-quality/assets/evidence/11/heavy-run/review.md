# Equipped-heavy locomotion candidate

Working candidate only; no production admission, baseline acceptance, or slice
completion. Motion is authored locally in Blender against the frozen equipped
source identified in [source integrity](source-integrity.json). Geometry, skin
weights and bind matrices remain identical to that source. The current root belt
refit and future geometry changes must be rebuilt with these clips and inspected.

## Pace rationale

The movement consumer scales only the above-walk range by class pace. All classes
therefore walk at the 1.7 m/s floor; a fresh heavy's prescribed run is
`1.7 + (3.4 - 1.7) × .9 = 3.23 m/s`. The existing terminal-run regression passes
and measures 3.11 m/s under its movement fixture ([test output](pace-test.log)).
Prescribed free pace is not a promise of that measured speed at every stamina,
terrain or formation state. No simulation behavior changed.

The previous archived 1.53 m/s walk used an incorrect whole-speed class
multiplier assumption. It is retained as historical fitting evidence, not an
actual-speed acceptance. This candidate retains 0.765 m steps and shortens the
cycle to 0.9 s (133⅓ steps/min). The run uses a 0.8 s cycle (150 steps/min),
0.28 s support intervals and 0.9044 m support travel, with two brief flight
intervals. These are provisional authored rhythm choices, not a new runtime
speed contract. Root horizontal translation remains zero.

## Evidence boundaries

- [Clip integrity](clip-integrity.json): ready and all three inspection clips
  are unchanged; locomotion endpoints agree to floating-point rounding.
- [Authored samples](grounding-authored.json): alternating support is grounded,
  soles do not penetrate beyond numerical rounding, and sampled sword vertices
  remain outside the body. Vertex tests do not establish triangle-clearance or
  exact handle contact.
- [Quarter-frame samples](grounding-subframes.json): interpolation still reaches
  2.16 mm walk / 2.65 mm run sole penetration. Flat-support center drift against
  prescribed translation is about 4.9 mm / 8.3 mm. These residuals prevent contact
  acceptance; no runtime IK was added to conceal them.
- The production route captures every authored frame from four bearings with a
  fresh byte-identical repeat for each tile. Native side frames and 2× feet
  crops supplement the whole-body sheets. GIFs omit duplicate endpoint frames;
  real-time GIFs use every third 30 Hz sample at 100 ms, preserving the exact
  0.9 / 0.8 s cycle duration. Slow GIFs retain all unique authored frames.

The first run review found credible alternating support but excessive upper-body
stability and weak push-off. The bounded response adds axial counterrotation,
carried-arm response, forward lean and ankle roll. Stronger walk toe-off first
exposed an opposite-sole error; earlier knee recovery corrected it without
weakening the floor assertion. The retained first-run sheet supports the visual
comparison. The side-sheet response changes 1,339,068 pixels; exact captured
source dimensions and hashes are in [artifact checks](artifact-checks.json).

Final unprimed review inspected every cell in all four walk/run sheets, native
feet crops and selected individual frames. Verdict: usable provisional equipped
locomotion, with no blocker to continued integration—not polished motion or
contact acceptance. Current run toe-off is visibly clearer than the first run;
bent-knee support and flight read distinctly. Remaining findings are restrained,
rigid upper-body response (especially walk front/rear 0–7 versus 14–21), weak
walk push-off (side 10–14 and 24–27), and pinched inner-knee shape at run 16 /
walk 20. Side foot overlaps were not treated as collisions because other
bearings preserve separation. The parent independently observed upright run
posture, mostly locked carry and a rigidly suspended vertical scabbard. Retain
all as explicit residuals. Neither reviewer observed timed playback, so cadence
and moving-world sliding are not visually verified by these stills.

An evidence extraction error invalidated the first corrected-walk derivatives:
the snapshot runner reports dimension mismatch without saving the current image,
and extraction fell back to the old 31-row baseline. Those derivatives and their
visual verdict were discarded and replaced by a fresh 28-row capture. The older
baseline is preserved in scratch, not blessed. Run derivatives were current.

## Reproduction and integration

The original authoring module owns motion; the existing candidate scene owns
camera/phase coverage. Rebuild with Blender's background Python entry point
`packages/soldier-assets/bake/blender-heavy-motion.py`, then run the sibling
`heavy-motion.mjs` baker. The saved motion blend is the default self-contained
source; `--source` selects a frozen fitted kit. Verify through
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5177 node web/scene.mjs heavy-motion`.

Root's heavy-kit composer already invokes `author_motion` before joining export
copies. Integrate this module, include run in the heavy baker's loop list, and
rebuild current body/gear/surfaces together. Do not copy this frozen candidate
over root's newer geometry. The shared exporter attribute flag preserves the
existing material faction mask; it changes no skinning or bind geometry.

Source review found no actionable correctness issue. The configured Codex CLI
review cannot run because its installed version rejects the configured model
([log](cli-review.log)); no tool upgrade or model override was used. Bake check,
typecheck, syntax and diff checks pass. Capture baseline differences remain
unaccepted. No tests or simulation expectations were re-baselined.
