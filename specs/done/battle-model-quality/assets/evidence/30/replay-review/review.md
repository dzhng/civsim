# Replay visual review

Target: the real production-rendered subject remains complete while observed
actions interrupt one another; equipment stays attached, and authored terminal
poses remain visible. These samples inspect sparse replay states, not full motion
smoothness, anatomy quality or simulation correctness. Appearance 41 is an
explicit geometric diagnostic, not a production soldier or an anatomical oracle.

The main reviewer inspected all 39 samples in chronological order through twelve
full-frame four-tile sheets and checked full originals for the detailed death
states and diagnostic framing. The half-size looping derivatives are
[foot archer](temporal-4.gif), [mounted archer](temporal-7.gif), and
[geometric diagnostic](temporal-41.gif). Active full-size PNGs remain in the
scene-owned replay baseline folder.
GIFs show each sampled state for 250 milliseconds; the recipe's unequal time
intervals are not presented as real-time motion cadence.

| Sample | Foot archer | Mounted archer | Diagnostic |
| --- | --- | --- | --- |
| Motion start | Walking stance, bow beside body | Seated rider and raised horse leg | Upright, arm extended |
| Motion quarter | Small leg/arm advance | Small leg advance, rider retained | Small stance change |
| Motion half | Small stance advance | Horse gait advances | Horse/leg block advances |
| Release 11 | Bow arm begins to rise | Horse legs advance under rider | Arm begins to lower |
| Release 14 | Arms cross upper torso, bow rises | Raised bow spans head/neck area | Arm angled down |
| Release 15 | Bow angle advances | Raised bow and rider retained | Similar arm pose, small advance |
| Release 18 | Bow almost vertical | Bow nearly horizontal above horse neck | Arm lowered further |
| Release exit | Arms rotate away from release | Rider action retained over gait | Arm extends again |
| Run during exit | Leg stance changes, arms still raised | Horse stride changes under raised arms | Extended arm and altered legs |
| Death entry | Retained upper-body action visible | Rider remains seated at entry | Earlier composed arm pose retained |
| Death quarter | Arms begin lowering | Bow turns upright; body remains high | Legs begin extending |
| Death blend end | Bow upright beside body | Upright body begins terminal action, cooler shading | Extended legs and angled arm |
| Terminal | Fallen on back, bow and bent limbs raised | Horse and rider fallen together | Upright terminal diagnostic pose |

No missing major body part, detached limb, frame-edge clipping or obvious raster
corruption was seen. The main verdict is usable state depiction under the user's
accepted quality cutoff, not a new art-quality approval.

## Independent critique

A fresh agent received only the images and a neutral inspection task. It read all
twelve sheets and six full originals. Its findings agree with direct inspection:

- **High confidence:** the foot archer's terminal bow/raised arm and bent knees
  read as a posed fallen body rather than relaxed weight settling.
- **Medium confidence:** fallen foot and mounted ground contact is weakly
  communicated by the shadows; no definite floor penetration was established.
- **Medium confidence:** the mounted release silhouette congests bow, string,
  hands and horse ears around the rider/horse head; this view does not establish
  actual intersection or detachment.
- The diagnostic remains coherent and changes arm/leg pose; its upright terminal
  shape is not judged against the detailed characters' anatomy.

These retained death/contact and bow-readability limitations belong to the
[visual follow-ups](../../../../follow-ups.md), not a new authoring loop.

## Baseline disposition

[Per-frame delta](baseline-delta.json) compares each new semantic sample with its
old numeric baseline. The production bundles and event durations changed, so
these are corresponding states, not equal-time asset comparisons. Thirty-seven
frames differ; the diagnostic death-blend-end and terminal frames remain exact.
This inventory proves actual raster change but does not assign every pixel to
the final normal correction: prior production cutover, pose and fixture changes
are included. The isolated native-normal proof lives separately in
[the causal record](../../final/posed-geometric-normal.md).

The corrected full replay UPDATE run passes numerical, functional and capture
checks. The [equipment-panel update](equipment-update.json) also passes, including
the replay's functional checks. Direct inspection and a separate fresh critique
read tick 165, Sidearm appearance, appearance 18, frozen source to walk at phase
0 and blend weight 0, no rider overlay, and submitted base destination walk 0.
Sword, shield, helmet, legs and scabbard are visible. The concise footer can be
mistaken for the composed pose when read alone; the explicit source/weight and
destination fields own that distinction. The inherited lab navigation overflows
at the right edge outside the replay panel; no replay-panel text is clipped.
The [final full ordinary repeat](../final-consumers/repeat.json) passes all replay
checks and all 45 replay images with zero differing pixels. A fresh image-only
review again confirms the handoff status is legible, with the same footer and
navigation limitations above. The source/weight assertion is deliberately named
as a frozen-source handoff check; it is not an independent numerical pose oracle.
