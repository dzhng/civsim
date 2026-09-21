# Corrected scene state and reload

Worker2da55ab2 +9c496b47 integrated asfce5e356 +3fc961ba. Independent review
accepted the pre-first-prepare finding; its correction has no further actionable
findings. Main combined candidate64/64 and live facade57/57 pass; live-test tsc0.

The direct GPU probe now passes the identical formerly failing ordering:
upload15560 soldiers, reload before the first prepare, then prepare/draw without
another source upload. The crowd epoch is1, all15560 admitted elevations agree
with terrain (span3.193m, max delta0, nonfinite0), and all tracked textures/buffers
are released. The fixed Menu build separately repeats full-population
seating/spawn/reload/disposal successfully with no page errors. Earlier missing
atlas/GPU rejection/disposal-in-admission evidence is retained under the initial
candidate; those failure injections were not rerun after this camera-only fix.

One detached record tracks the latest camera that posed the crowd; only completed
preparation publishes preparedCamera. The additional record is bounded, not
proportional to army size. Inspection remains explicit. No visual, GPU-feet,
stutter or net-shadow performance acceptance follows from these checks.

Remaining capability work includes actual TypeGPU identity and terrain, environment,
tactical line and grass diagnostics. Those currently report null/obligations; they
must not be fabricated to satisfy source-shaped verification. The raw comparison
world retains the identical early-reload defect and is not patched by this pass.

## Changed test behavior

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| typegpuSceneLifecycle: admitted empty crowd replacement | Fake returned null after empty upload; expected no staged upload | Real empty admitted pose is carried as [] | The history admits an empty array; only absent admission is null. Corrects the double and assertion, not post-prepare production behavior. **moved** |
| facade: retired comparison identity | TypeGPU fixture expected unavailable identity | Vgpu fixture retains that unavailable contract; separate TypeGPU test covers its owned diagnostics | TypeGPU now implements crowd ownership; retirement contract belongs to remaining comparison backend. **moved** |
| facade: retired comparison seating | TypeGPU fixture expected no population to inspect | Vgpu retains refusal; separate TypeGPU test expects measured admitted state | The capability conversion makes TypeGPU the positive path. **moved** |

Other lifecycle tests now obtain an admitted pose via their audience's upload rather
than a global toggle; their assertions remain unchanged. The prepared-camera test
uses a type-safe matcher with identical expected values, resolving its inherited
TS2571. Two new populated/empty early-reload tests fail before and pass after the
fix. No performance threshold, visual baseline or simulation stat was changed.
