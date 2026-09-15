# Composed native directional shadows

The reduced HDR frame now receives the existing directional shadow on terrain and
soldiers. Its shadow audience uses the same prepared pose and source projection
views, but a distinct light camera and depth pass. The borrowed shadow resources
join the environment's existing material group; the caster stage binds only the
view uniform, so it never samples the depth attachment it is writing. The no-shadow
path emits no shadow sampling and retains the prior frame's output exactly.

Both one- and four-sample runs finish with zero GPU/browser errors, nonfinite
outputs or retained candidate textures. Shadow-on changes about 19,000 tactical
pixels and 2,500–2,800 horizon pixels relative to off. All inspected off images are
byte-identical to the corresponding committed frame-port control. Effects and
unchanged-off comparisons are recorded in `effects.json`; off images are therefore
referenced from [frame-port evidence](../frame-ports/) rather than duplicated here.

**The initial source shadow frame is wrong relative to its subsequent identical
presentation:** its tactical shadow extends left while the native and subsequent
source shadows extend right. This occurs at both sample counts. No warm-up hides
it, and no cause is claimed. Later paired frames closely correspond, while the
previous native one-sample first-frame soldier shading difference also remains.
The strict image diagnostic is therefore still red; this pass does not establish
cold-frame or complete-scene parity.

[Fresh independent review](review/findings.md) confirms the initial source-direction
discrepancy, plausible foot contact in the native result and close correspondence
of the remaining pairs. Four-sample native repeats are identical; one-sample plain
repeats differ within soldier pixels. These are static, twelve-soldier views, not
the user's full battle or a temporal/performance acceptance claim. Whole-map
coverage improvements and their net cost remain later work.

Source review found a wrongly inferred mutable frustum list in the control; it is
now explicitly typed with the shared projection-view contract. The raw control
TypeScript project and frame build pass. The primitive source color conversion
uses a narrow output-type assertion because pinned Three declarations erase the
explicit `vec3` conversion's type; its GPU recheck reproduces every previously
reviewed primitive PNG byte for byte.

Use the shared frame control with `?shadows` or `?shadows&samples=4`; unsupported
backend shadow paths fail explicitly until their receiving passes are implemented.
