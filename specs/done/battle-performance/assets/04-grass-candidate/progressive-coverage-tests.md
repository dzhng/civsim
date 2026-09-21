# Progressive coverage test changes

These changes belong to the isolated grass candidate; they do not waive the
moving-camera visual and timing gates.

| Test (in `web/tests/battleGrassTravel.test.ts`) | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| sustained travel keeps publishing focus coverage | Only nonempty records after a route extending beyond the field | Visible admitted detail within one snapped cell of every interior stop | The old test passed while all accumulated detail stayed invisible; the strengthened test failed before the fix. **moved** |
| published coverage only moves onto resident tiles | Entire requested circle had zero missing tiles | Every tile in the actual admitted region is resident; larger request may remain pending | A smaller fully resident region can safely replace base density while the rim loads. The resident-coverage invariant remains. **moved** |
| focus field draws nothing until coverage (replaced by resident inner coverage grows) | Invisible through partial arrival | Visible inner region grows at a fixed camera while the request remains incomplete; completion generation advances only after settling | Whole-circle admission caused starvation under travel. Exact-one-field partition tests and bounded upload tests remain unchanged. **moved** |

The six focused suites pass 38 tests. Web TypeScript checking passes. Independent review caught off-terrain retention; a new regression proves that an empty request releases all tiles, removes the mask and completes its generation. The hardware probe observes partial
coverage through 79 of 180 moving-camera frames with no nonresident admitted
region. These are correctness observations, not an FPS or no-popping verdict.
