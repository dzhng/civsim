# Battle camera and mouse controls

Middle-drag owns camera rotation. Right-drag owns the selected units' existing
formation destination and facing preview, and right-click remains a point
order. A right drag that returns to its start does not become an accidental
click. Battle wheel travel is twice the previous sensitivity; campaign input
keeps its existing response.

Automatic tilt opens toward the forward battlefield sooner during descent.
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
- The automatic tilt begins at 200 m instead of 100 m, retaining the same wide
  overview and close endpoint. At 40 m the camera looks down about 42 degrees
  instead of 55 degrees; the change is continuous in physical distance.
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

## Verification

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
