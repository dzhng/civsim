# Measured gait cadence, not commanded walk

The seed7 live fixture recorded actual walk↔run changes while its unit was
commanded to walk. Animation follows observed motor-capable path, not that order.
The bound heavy walk/run nominal midpoint is approximately2.465m/s; all720
recorded right-endpoint destinations agree with path delta divided by1/30s.
The trace covers91 consecutive ticks and eight soldiers, unchanged appearance0.
Its14 transitions differ from the earlier aggregate's12: this is the same
fixture, not an identical startup-tick replay.

Every interval matches its preceding gait's stride, maximum error
2.5673907444456745e-15cycles. Using current destination stride produces
0.02219135406504124 error; using walk stride throughout produces
0.023667611646626917. The source controller already obeyed the completed-interval
contract. No simulation, source animation, runtime clock or threshold is changed.

`trace.json` retains all sampled index/appearance/clip/phase/path values, actual
metadata, original assertion results and transition rows. The full original
playback-rich report remains preserved at
`/Users/david/dev/game-artillery-equipment/throwaway/gait-trace.json`; its scratch
runner calls the unchanged production scene. Capture88140 completed exit0 with
browser closed, but original two scene assertions remained red. Diagnostic exit0
is not a green browser gate.

The attempted adapter wrapper recorded zero calls because it imported an
unversioned module while Vite's actual dependency had a timestamp query. No
adapter flags or observation-object capture is claimed. The independent engine
motor counters and actual submitted playback suffice for this denominator and
clip-threshold diagnosis; pressure recovery versus voluntary catch-up is not
established here.

## Changed-test ledger

- `web/scenes/battle/battle-anim-gait.mjs`, class/gait assertion: previously
  required zero clip changes and only manifest walk; now requires stable
  appearance and declared calibrated gait destinations, retaining transition
  telemetry. **Provenance:** observed engine path and current authored bindings.
- Same scene, distance assertion: previously used walk stride for every
  increment; now uses the prior destination gait's stride. **Provenance:**
  completed-interval policy and all720 captured intervals. Unchanged1e-6 limit,
  positive phase advance/no negative steps, consecutive90-tick span and8 samples.
- `web/tests/battleAnimGait.test.ts`: existing variable-speed/wrap and appearance
  controls now consume declared gait metadata. New unequal2m/4m stride test
  crosses walk→run→walk and wrap, expecting0.15cycles. Original walk-only code
  and a deliberate current-stride mutation each fail the new assertion;
  restoration passes all3 tests. Wrong stride calibration and phase-jump
  negative controls remain explicit. **Provenance:** independently constructed
  physical distances, not fitted production trace values.

Focused Vitest3tests and web TypeScript pass. Independent read-only Codex
review1446 found no defect within the two-file scope and independently reran
all3 tests; no GPU launched by the reviewer. Main shape review retains the scene
as the sole owner and uses shared ACTION_ROLES/isGaitRole rather than another
role registry. The subsequent [merged browser repeat](merged-live-repeat.json)
passes all checks on the corrected production renderer. The root's existing60s readiness value is preserved,
not a timing-policy change in this pass.
