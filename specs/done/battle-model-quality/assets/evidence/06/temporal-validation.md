# Temporal playback validation

The production workbench exercises dense synthetic observations through the real
controller, GPU palette, materials, shadows and corpse presentation. This accepts
pose transport, not temporary soldier art. Detailed Blender anatomy stays after
the measured budget step.

## Evidence and precision

The [combined run](temporal-final.json) passes531 checks across temporal replay
and the existing palette consumer scene. All39 captured candidates have strict
repeats, including the [filtered strict repeat](temporal-strict-repeat.json).
Independent CPU poses agree with27 actual GPU palette readbacks within
5.364418029785156e-7, below the unchanged1e-5 bound.

Rendering CPU-preposed geometry from validated readbacks differs from production
by at most one8-bit channel level. The [quantization experiment](temporal-quantization.json)
measured five non-identical samples, each at one level, with at most9 pixels
affected. This is a channel allowance, not a high-contrast pixel exception.
Repeated frames, same-time event boundaries and screenshot baselines remain exact.

Original end-to-end CPU-image equality did not pass. Its
[red evidence](temporal-raster-red.json) includes one high-contrast shoulder pixel.
The [isolation experiment](temporal-raster-isolation.json) substituted only the
validated GPU matrices into the CPU reference; rendering then matched exactly,
with shadows enabled. A small matrix difference was amplified at a surface or
shadow boundary; the exact kind of boundary was not established. Original
CPU-image differences remain telemetry beside the two checked contracts, not a
relabeled image-equality pass.

## Fixture boundaries

Fixed foreground regions exclude ground shadows. Suppressing actual palette
computation while submitted phases advance freezes that foreground; restoring
computation restores movement. Separate background pixels stay unchanged. The
replay tests interruptions on both sides of blend midpoint, mounted exit during
a changing base, composed death onset, terminal hold, rewind/pause, bounded
CPU/GPU frozen-pose storage, and no reupload of retained snapshots. Actual
frustum submission distinguishes upright from fully rolled corpse bounds.

The authored mounted diagnostic receives test-only presentation bindings from
`_mounted-temporal-fixture.ts`, preserving original gait and rider-action tracks.
Its synthetic terminal alias proves full-body transition and hold, not authored
death art. Its catalog and gameplay admission remain unchanged.

Viewport is1280×800; production controls leave a970×758 canvas, reference mode
uses1280×800. Each fixture pins its own framing and records camera/pose settings.
They are not pixel-compared to each other. Background uploads settle before
the measured render. An initial mounted freeze-control failure did not reproduce
on the next instrumented run; no exact cause is claimed without its image.
The final fixture adds an exact stationary pre-control frame. A later capture
was invalidated by a development-server reload during editing; subsequent
captures ran against unchanged source.

## Visual review

Root inspected all39 full frames in order. An unprimed reviewer independently
inspected all frames and2× crops. No clear attachment jumps, disappearing
segments or discrete pose resets were found; bow and faction band stay attached.
Irregular sampling does not establish real-time rhythm or believable falls.

- The [diagnostic shoulder](temporal-review/41-11-39.5-crop.png) has a small
  pose-dependent notch, with its lower attachment intact. This is crude test
  geometry, not accepted soldier anatomy.
- The [mounted terminal pose](temporal-review/7-12-72-crop.png) leaves mount
  segments upright above the rider. It preserves the inherited placeholder
  assembly fall; slice24 must replace it with authored mounted death art.
- Fine shadow striping persists through poses; no shadow popping was observed.
  Lighting redesign remains outside this feature.

Review strips: [foot](temporal-review/4-sequence.gif),
[mounted](temporal-review/7-sequence.gif),
[articulated diagnostic](temporal-review/41-sequence.gif). They use only gated
stills at200ms per sample, not constant-speed footage. Preview opened the set at
13:15UTC for the non-blocking human checkpoint. No transport-specific correction
arrived during the review interval. The decision is to accept transport only on
the numerical, exact-repeat and independent visual evidence, not to accept the
blocky models or their motion as finished art. The user's concern about delaying
Blender remains valid: detailed anatomy follows the measured budget, with no more
placeholder-art polishing. Preview was rechecked and has no open windows.

## Review and test ledger

Shape review centralized preposed-bundle construction and replaced positional
booleans with named options. Diff review caught inventory drift; captured names
must now match declared snapshot names. Independent code/raster reviews found
no remaining blocking defect in the composed proof. The CLI review could not
run: its server rejected the installed CLI as too old for the configured model.
No toolchain/model was changed; independent agent reviews are the fallback.

Typecheck and284 web tests pass. Four new mounted-fixture tests cover admission
and source immutability, original-track decoding, continuous transitions/exit/hold,
and moving unmasked horse/pelvis/legs. Existing unit assertions were not repinned.
No simulation or unit-stat changes occurred.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `battle-model-action-replay` | Controller choices and one controller frame; no isolated dense rendered proof. | Preserves those checks; adds foreground freeze/recovery, boundary/pause/hold, bounded residency, frustum behavior and CPU/GPU reference checks. | Supplies missing transport acceptance without deleting old controller assertions. **moved** |
| Temporal CPU-image parity introduced during this pass | Tentative literal image equality rejected a boundary despite matrices within1e-5. | Independent matrix check followed by palette-consumer image check within one channel level; original differences remain telemetry. | Readback substitution isolated the precision domains instead of excusing one specific pixel. **moved** |
| `battle-model-palette` | Built its CPU identity-rig reference inline. | Uses the shared preposed-bundle owner; all existing assertions remain. | Removes duplicate reference construction with unchanged expected output. **moved** |

The scene/helpers own sampling. Run `web/scene.mjs battle-model-action-replay
battle-model-palette` with `VERIFY_GPU=1` and the explicit feature-worktree
`VERIFY_URL`. SwiftShader image checks remain separate from hardware budgets.
