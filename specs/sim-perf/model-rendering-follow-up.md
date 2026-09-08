# Authored-model rendering budget follow-up

On 2026-09-08 David accepted completion of battle-model-quality with a
documented performance follow-up, then asked that this spec own it. The original
33 ms frame-time threshold remains unchanged and unmet; accepting the model
delivery does not make that gate green.

## Evidence and limits

The close-view animation stress workload used 30,000 soldiers at 1280×800,
with steady-animation and interruption cases. Its latest measured averages were
about 39–40 FPS for heavy infantry and 23–26 FPS for medium phalanx. Frame-time
p95 reached roughly 50 ms; average throughput does not clear the tail gate.

The medium run overlapped unrelated CPU-intensive processes and no quiet-machine
rerun completed. These are renderer/animation measurements, not full live-battle
simulation framerates. GPU queue elapsed time includes submission gaps and must
not be described as active GPU pass time or added to CPU time as independent cost.

The model delivery retains the raw
[heavy](../done/battle-model-quality/assets/evidence/15/actual-mesh-lod/usable-budget-heavy.json) and
[medium](../done/battle-model-quality/assets/evidence/15/actual-mesh-lod/usable-budget-medium.json)
reports. Treat those as a starting observation, not a clean-machine
baseline or proof of the remaining bottleneck.

## Next pass

First reproduce the authored-model workload on a quiet machine, recording the
revision, hardware/browser, viewport, model/LOD workload, machine load, average
FPS and frame-time percentiles. Measure CPU submission, GPU passes and frame
cadence separately. Keep uninstrumented controls so instrumentation overhead is
visible. Then compare the paused-simulation renderer with a live battle under
the same conditions before choosing which owner to optimize.

Keep this work separate from the tick/worker experiments: moving simulation to
a worker does not prove that model rendering fits its budget. Preserve the
existing renderer gate, accepted model silhouettes and canonical animation
states; do not silently weaken thresholds, substitute placeholder assets or
change simulation behavior to obtain a pass. Any renderer change belongs in a
separately scoped pass, not inside a tick/worker slice whose firewall forbids it.
