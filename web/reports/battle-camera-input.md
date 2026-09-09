# Battle camera and mouse controls

Middle-drag owns camera rotation. Right-drag owns the selected units' existing
formation destination and facing preview, and right-click remains a point
order. A right drag that returns to its start does not become an accidental
click. Battle wheel travel is twice the previous sensitivity; campaign input
keeps its existing response.

Automatic tilt follows the supplied army-wide, oblique, and soldier-height
references. The curve uses physical distance so the same formation scale has
the same angle on differently sized battlefields.
Manual look preserves its chosen heading and horizontal target during zoom.
The earlier cursor anchor could intersect very distant ground at a shallow
angle: a wheel step of 1.51 m moved the eye 107.07 m in the regression. Removing
the input's pitch reset alone still moved it 107.34 m. Keeping the manual look
target stable removes that lateral translation; inward zoom continues bringing
its target elevation toward the ground. Home/Backspace restores automatic look.

## Decisions and review

- Mouse gesture ownership is explicit, with no modifier required to use the
  existing formation placement. Middle-drag keeps its fixed-eye rotation.
- Manual look zoom does not chase a near-horizon cursor intersection. Tactical
  zoom still anchors the cursor. Manual pitch is preserved through zoom, rather
  than silently relaxing after the ground anchor was calculated.
- Automatic framing remains nearly vertical in the distant overview, visibly
  starts tilting at army scale, and approaches a low horizon view continuously.
  The angle and lens remain owned by the battle zoom rig.
- Sensitivity doubles logarithmic wheel travel. Multiplying the zoom factor
  itself by two would cause a jump even for a tiny input.

## CHANGE LEDGER

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `input.test.ts`: rotation gesture | Right-drag rotated with or without a selection. | Middle-drag rotates at the eye and issues no order. | Restores the requested mouse binding. **moved** |
| `input.test.ts`: formation gesture | Required Alt-right-drag; checked that an order was called. | Plain right-drag previews and sends its actual destination/facing without moving the camera. | Restores formation placement and checks its values. **moved** |
| `input.test.ts`: wheel after a turn | New regression observed 107.07 m of eye travel for 1.51 m of zoom. | Eye travel stays proportional to zoom, preserving pitch and yaw. | Removes distant cursor re-anchoring in manual look. **moved** |
| `input.test.ts`: wheel sensitivity | One synthetic 120-pixel input retained about 96.47% of distance. | Retains about 93.06%. | Doubles the requested scroll travel. **added** |
| `cameraRig.test.ts`: physical tilt | Tactical floor at 100 m; horizon-like pitch only below 25 m. | Tactical floor at 200 m; approach opens by 100 m; horizon-like pitch below 35 m. | User requested forward visibility sooner. **moved** |
| `battle-terrain-controls`: gestures | Checked right-drag camera rotation. | Checks middle rotation, right-drag preview/destination/facing, unchanged camera while ordering, and stable off-centre wheel after a turn. | Pins the real browser controls and their interaction. **moved** |
| `battle-terrain-controls`: tilt | Required a steep tactical pitch at 100 m. | Requires an earlier approach angle while keeping the 200 m overview. | Follows the revised framing contract. **moved** |
| `battle-wheel-zoom`: repeated input | Twelve wheel events exercised the wide-view grass gate. | Six events reach the same physical distance. | Sensitivity is doubled; the grass workload check keeps the same camera. **moved** |
| `battle-camera-approach` | No matched 25 m approach capture. | Freezes the reported seed at that distance for camera-angle review. | Pins the earlier forward view against visible soldiers. **added** |

The formation browser check explicitly rounds pointer coordinates before
projecting the expected ground hits. Expecting a mathematically horizontal
world drag from fractional browser coordinates introduced a small quantization
error; the test now checks the actual pixels supplied to the input system.

## Earlier input verification

- All 422 web tests, typecheck, and production web build passed.
- Hardware browser checks passed for right-drag formation preview, actual
  destination/facing, stationary camera during orders, middle-drag fixed-eye
  rotation, immediate ground previews, and the revised tilt.
- The browser's off-centre wheel after middle-look moved the eye 1.63 m for
  1.79 m of zoom travel, preserving heading. The high-look/full-zoom sequence
  still returned from 3,116 m clearance to 3.2 m.
- Equal browser wheel events retained 96.47% of distance each, compared with
  the previous 98.22%; six events reached the same 2,579 m overview as twelve
  did previously. Grass remained disabled in that distant view.
- The [25 m approach capture](../shots/battle/camera-approach.png) repeated with
  zero pixel differences. Independent visual review judged it modestly more
  forward-looking and found no clear new framing defect. Neither matched view
  shows a full horizon, so this capture does not establish combat visibility.
- Independent code review found no actionable regressions after tracing the
  input, formation-order, camera, and shared consumers.

## Follow-up verification review

The production controls needed no further change. The browser helpers now read
unit fields from the production layout instead of maintaining a second offset
map. The drag-preview check verifies the current destination and orientation;
an earlier point-order preview can no longer satisfy it merely by existing.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `battle-terrain-controls`: drag preview | Any non-null preview passed, including the preceding point-order preview. | The preview must occupy the drag destination and have its requested axis. | Distinguishes the current formation drag from stale feedback. **strengthened** |
| Unit-info browser readers | Copied or literal buffer indices. | Consume the production field map. | Keeps the same behavioral assertions without a parallel layout contract. **unchanged behavior** |
| `battle-camera-approach`: image scope | Included a HUD whose tray repaint differed between repeated captures, even with no active animations; battlefield pixels matched. | Captures the camera view without the HUD. | Keeps this gate about framing; the controls flow separately verifies formation feedback. **baseline updated** |

The stronger preview assertion passed against the live game and failed when
its drag press/release were deliberately suppressed, leaving the earlier point
preview visible. All 422 web tests and typecheck passed. Independent review
found no production correctness regression; the follow-up changes only test
readers, assertions, the camera capture, and this report.
The camera-only snapshot then repeated against the live build with zero pixel
differences. The HUD remains visible in the game; only this framing capture
excludes it.

## Three-reference calibration

The latest references use generated seed `2062736894`. Their exact saved camera
poses were unavailable, so the visual fixture matches the army layout, visible
formation scales, and the middle reference's side-on heading. Its views cover
[army-wide framing](../shots/battle/camera-reference-overview.png), the
[oblique approach](../shots/battle/camera-reference-oblique.png), and the
[closest allowed zoom](../shots/battle/camera-reference-closest.png).

The first view remains useful for orders while beginning to tilt. The middle
view shows the formations obliquely. Maximum zoom places the horizon in roughly
the upper sixth of the frame, just above the nearby soldiers. The closest distance stops at the authored soldier-height vista; continued
inspection zoom no longer magnifies through the ranks. Existing terrain
clearance, mouse bindings, wheel sensitivity, and manual-look anchoring continue
to use their existing owners.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `cameraRig.test.ts`: physical tilt | Kept a tactical pitch at 200 m; opened the approach by 100 m. | Begins visible tilt at 400–500 m, gives a 37–49° oblique view at 90–110 m, and places the closest horizon at 12–20% of frame height. | Matches the three supplied framing references. Failed before the curve change at 499 m. **moved** |
| `cameraRig.test.ts`: endpoint clamp | Required bit-exact interpolation equality with the endpoint literal. | Requires equality within 1e-12 radians. | The new angle interpolates to 0.30000000000000004; this is floating-point rounding with no visible difference. **moved** |
| `battle-terrain-controls`: automatic tilt | Probed 200/100/40/20/10 m for the later descent. | Probes 700/500/100/20/10 m for overview, initial tilt, oblique approach, and close framing. | Exercises the revised physical framing through the live camera. **moved** |
| `battle-camera-reference` | No three-scale reference gate. | Captures the supplied seed at army-wide, side-on approach, and actual maximum zoom. | Guards the requested framing rather than an arbitrary close-up. **added** |
| `battle-camera-approach` | Captured the previous 25 m approach angle using hardware rasterization. | Captures the revised angle using the canonical SwiftShader adapter. | The framing moves intentionally; adapter provenance now follows the screenshot skill. **moved** |

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `cameraRig.test.ts`: close endpoint | Continued from the 10 m vista down to a 3.5 m inspection floor. | Saturates at the authored 10 m vista; larger zoom values produce the same frame. | Independent comparison found the inspection floor overmagnified the third reference. The new saturation test failed on the old rig. **moved** |
| `camera.test.ts`: outward zoom after a turn near the floor | Started at 3.51 m and limited vertical amplification. | Starts at 10.01 m with the same vertical-amplification assertion. | Exercises the revised closest boundary. **moved** |
| `battle-terrain-controls`: high free-look descent | Scrolled until distance was below 4 m. | Scrolls to the new 10 m endpoint and retains the ground-clearance check. | The requested closest framing replaces the extra inspection range. **moved** |
| Reported-map fixture readiness | Allowed 120 seconds for shader compilation and readiness. | Allows up to 300 seconds; the same readiness predicate must pass. | Canonical SwiftShader exceeded the previous startup allowance. **test infrastructure** |

Fresh visual review confirmed the overview scale and close horizon placement.
It identified overmagnification at the old 3.5 m floor; a comparison at 10 and
15 m preferred 10 m for the reference's low viewpoint and overlapping ranks.
The fixture shifts its close target slightly sideways to keep its own banner
out of the center, approximating the supplied composition.

The reviewer also observed terrain speckling and weak contact shadows already
present in the matched pre-change captures. Soldier shield poses differ from
the user's captured instant; no animation or model code changes in this pass.
These captures establish camera framing, not exact historical soldier poses.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `battle-model-budget`: close workload | Imported the removed extra-zoom ceiling and measured the 3.5 m camera. | Uses the authored maximum zoom, matching the 10 m production endpoint. | Independent review caught this dynamic-import consumer; close and vista now share the same endpoint. **moved** |

## Final calibration verification

All four canonical SwiftShader captures repeated with zero differing pixels.
The final fresh visual review judged the closest camera's perspective and
relative soldier scale a broad match to the supplied third reference. Formation
placement and shield poses still differ from that historical image; edge-cropped
formations in the wider views follow the supplied inspection framing.

All 422 web tests, typecheck, and the production web build pass. The real-browser
controls and wheel flow pass, including the revised angle progression and
return to 3.2 m ground clearance after manual high-look zoom. Transient preview
and input timing were checked on hardware: the much slower software renderer
could let a short-lived destination preview expire before the harness read it.
No hardware capture was used to bless a visual baseline.

The focused model-budget close workload also passes with 100 soldiers and ten
measured frames per mode, resolving the independent review's stale dynamic
import finding. This verifies that caller's migration, not a new full-load
performance claim. The review's missing-baseline finding is resolved by the
four committed camera images. Shape, code, and documentation review are complete.
