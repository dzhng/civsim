# Workbench action replay

This checkpoint verifies action selection and submitted phases, not finished model art or GPU blend continuity. The existing workbench exposes the replay with `?replay=1`; its ordinary manual inspection view stays pixel-identical. The replay is explicitly synthetic, uses the loaded presentation bindings and real controller, and submits through the production instance builder and world. The panel distinguishes controller base/upper-body state from the base clip actually drawn before slice 06.

[Open the replay on the main development server](http://localhost:5174/renderer/battle-models?replay=1). If using another Vite port, retain the same route and query. Expand **Action replay**, then choose Play or an event. [Strict scene report](scene-report.json), [reviewed panel crop](panel-2x.png), and [earlier UI comparison](before-ui.png) retain the verification artifacts.

The deterministic observation fixture owns only the exercise sequence. It does not implement action priority or a second renderer. Backward seeking resets and replays intermediate observations so event edges survive scrubbing. Equipment selection reuses the canonical appearance registry; custom diagnostic names do not inherit an unrelated roster sidearm. Manual-only bundles keep manual clip inspection without pretending to support action replay.

## Evidence and review

The named browser scene is `battle-model-action-replay`; its committed snapshot is under `web/shots/models/shared/soldiers/action-replay`. Reproduce from `web` with `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5191 node scene.mjs battle-model-action-replay`. Captures use the software baseline, 1280 × 800, fixed production camera/environment. No art, lighting, terrain, loader, controller or shader implementation is part of this pass.

Focused unit tests pass. A mutation that skipped intermediate observations failed at the first melee checkpoint: fresh phase 0 instead of the elapsed phase, with different frozen source and blend weight. Browser checks cover repeated release, injury, terminal death, rewind/pause/reset, equipment, submitted mounted overlay state and actual play/event controls. The diagnostic reports submitted clip/phase, not GPU palette readback; the current VAT still quantizes poses. A valid manual-only reload is successful and exits replay; restoring the unconditional replay constructor made that assertion fail. Failed reload retains replay history; successful reload resets it.

All five existing workbench snapshots, including its default controls, remained at 0 changed pixels. The combined verification run had three expected stale missing-clip message failures in verification-only loader copies; those are not replay failures or accepted assertion changes. Main separately verified its corrected admission messages. No existing baseline was updated.

Shape review kept observation generation in a small fixture and UI in the existing route; controller and instance mapping retain their existing owners. Independent code review found and resolved the manual-only reload and stale tick display defects; follow-up review found no remaining code issue. The final test additionally compares seeking at intermediate checkpoints, not just terminal death.

Fresh screenshot critique drove labeled state sections, explicit phase/blend labels, readable event selection, larger text and full footer framing. Direct inspection caught the footer still naming the manual clip during replay; it now reports the submitted instance. Optional low-contrast slider marks were removed in favor of the readable event picker. Raw clip identifiers are intentional diagnostics. The narrow bronze panel follows the existing workbench style, not a new game HUD design. Enlarged crop pixelation is scaling telemetry, not a new renderer defect.

The reviewed UI iteration changed only the right panel: 0 changed pixels in the world region left of x=970 at the matched camera. This is UI acceptance only. Placeholder anatomy and motion remain explicitly unaccepted; no Preview silence or automated check constitutes user art approval.

## Choices for integration

Query-gating preserves the ordinary inspector but makes replay less discoverable. The bounded synthetic sequence exercises fresh/repeated release, health loss, equipment and death, not every capability. Mount-health loss has a controller test; integration added non-null held-pike readiness coverage in12fa3d81, closing the reported role gap without claiming physical brace detection. Successful reload resets from the original replay appearance; a valid manual-only replacement exits replay rather than rejecting an otherwise valid asset. Camera edits preserve replay, while manual appearance/clip/phase/formation edits return to manual inspection. These are workbench interaction choices, not gameplay semantics. The parent integration pass owns the broader choices ledger and spec link.

Integration corrected the diagnostic heading to **Submitted to renderer** and
split the limitation copy into explicit lines. Exact RGBA comparison reports no
changed world pixels left of x970; the copy-only second iteration changed4231
panel pixels. The new scene initially inherited the shared screenshot helper's
tolerant defaults: a label change incorrectly passed that gate. Integration now
passes explicit zero threshold/zero area tolerance, observed the intended label
and copy changes fail, and refreshed only this new scene's baseline. Earlier
zero-pixel repeat results remain observations, not evidence that its gate was
configured strictly.

The final [fresh critique](critique.txt) recommends a wider, less dense diagnostic
panel. Its clipping claim was investigated rather than accepted from confidence
alone: the actual submitted footer rectangle is y770–788 inside the800px viewport,
with12px remaining below, and every replay control/status rectangle is inside
the capture. A new browser assertion pins that visibility. Direct inspection
shows complete letters and no overlap. The footer belongs to the existing lab
shell, outside the model-control border, rather than escaping it.

Raw clip names, source/target phases and distinct submitted state are intentional
author diagnostics; replacing them with friendly summaries would hide precisely
the mismatch this checkpoint must expose. The current/next event and thin layer
separators provide adequate grouping for this bounded tool. Width, typography and
bronze control styling remain the existing inspector convention; a broader layout
redesign is not part of the action-selection proof. This is a bounded acceptance
with recorded readability preferences, not a claim of a universally clean visual
critique or approval of placeholder art.
