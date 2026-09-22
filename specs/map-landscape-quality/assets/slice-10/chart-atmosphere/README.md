# Chart-scale atmospheric depth

The flat campaign overview inherited battle-scale atmospheric extinction measured
from the ground focus. Across thousands of world units this replaced faction and
terrain colors with beige sky/ground in-scatter. It also reduced exploration
contrast because visibility darkens terrain before atmosphere.

Campaign now scales the complete aerial optical depth with its existing chart-to-
regional detail band, using CSS pixels per world unit. Zero at chart scale means
no aerial veil; regional/close views retain full depth. This is a presentation
transition, not the live camera projection: the legacy interaction/card band and
the physical camera rig remain distinct existing policies. Shared aerial defaults
remain one; exploration radii, hiding, fog darkness, lighting and colors are unchanged.

The actual render consumes persistent world state, so camera preparation cannot
reset the strength. Focused tests prove default1, chart0, regional1 at draw time and
DPR1/2 equivalence.18 focused tests and typecheck passed; a final5-test rerun after
removing an unused fixture stub also passed. Independent review found no defects.

## Visual evidence

All six regional/close frames match their accepted-build controls exactly. The
three overview frames change substantially and repeat exactly. Root and unprimed
review favor the clearer coastlines, water/land distinctions, faction colors and
explored-area contrast. Revealed peripheral mountains remain too angular, and
unknown terrain reads less concealed even though visibility semantics are unchanged.
These are limitations, not claims of whole landscape acceptance.

The repeat also exposed an intermittent DOM label-control restoration failure:
the regional frame before that control is identical, but later views differ in
card-title paint. This is being diagnosed separately; the whole scene is not
claimed deterministic or green. Both runs retain old snapshot failures and the
southern-Apennines ground-coverage failure0.5444. No baseline refresh is recorded here.

## Test change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Chart/detail endpoints | No campaign depth policy test | Overview0, detailed1 and smooth intermediate depth | Chart distance must not inherit a battlefield haze scale. **moved** |
| Drawing consumes strength | No draw-time strength assertion | Consumed sequence [1,0,1] survives camera preparation | A preliminary camera-argument implementation reset depth during render; persistent world state avoids that bug. **moved** |
| DPR-equivalent view | No atmospheric DPR assertion | Same physical view at DPR1/2 supplies equal intermediate strength | Device pixels must not change presentation depth. **moved** |

Prepared-frame fixture initialization gained the owned uniform; its existing
behavioral assertions remain unchanged. No simulation, unit-stat or camera rig
changes accompany this pass.

## Accepted checkpoint

The nine historical LOD baselines (last refreshed at c87418b5 before physical-world
cutover) were migrated after review. All six detailed views preserve their current
accepted production content; the three overview views additionally accept the
chart atmosphere correction. The no-update repeat passes all nine snapshot
comparisons, all owner controls and no-page-error checks. Its only remaining
failure is the unchanged southern-Apennines coverage0.5444. The restoration check
now permits the measured one-RGB8-step precision boundary only within cards, and
this final run restored with maximumCardChannelDelta0/outsideCardChanges0.

The atmosphere production change adds one persistent scalar uniform and reuses
the existing chart/detail band; no textures, geometry, new render pass or backend
wrapper is added. Camera policy moved to its neutral owner with unchanged values.
Shape/diff/docs reviews found no remaining defect in this bounded pass.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Nine campaign LOD snapshots | Pre-cutover physical rendering | Reviewed current physical rendering; only overview differs from the immediately preceding build | Six images migrate previously accepted renderer changes; three also remove inappropriate chart aerial depth. No cameras or states changed. **moved** |
