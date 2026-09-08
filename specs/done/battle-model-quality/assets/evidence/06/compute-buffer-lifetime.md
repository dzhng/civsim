# Three compute-only storage lifetime: bounded prerequisite probe

2026-09-06; main source 25f8dee8, installed Three 0.185.1. No production changes,
framework upgrade, committed snapshot, or performance claim.

## Measured result

Actual Chromium WebGPU / SwiftShader. Instrumented the actual caller-created
GPUDevice.createBuffer and each returned GPUBuffer.destroy, filtering STORAGE
usage. The GPU allocation API was instrumented; no private renderer cache was patched. The candidate release operation invokes the
existing renderer attribute owner. Two runs returned identical counters and no
observed uncaptured GPU errors. Computed/read-back values were [7,7,7,7] both
before release and after recreation.

| Operation | Cumulative storage creates / destroys | Renderer storage accounting |
| --- | --- | --- |
| Initial dispatch | 1 / 0 | 1 allocation, 16 bytes |
| attribute.dispose() | 1 / 0 | Still 1 / 16 bytes |
| computeNode.dispose() | 1 / 0 | Still 1 / 16 bytes; pipeline/uniform accounting cleared |
| renderer._attributes.delete(attribute) | 1 / 1 | Zero |
| Repeat same deletion | 1 / 1 | Zero |
| Redispatch same attribute and disposed compute node | 2 / 1 | Correct new allocation and readback |
| Dispose it and three new owner generations | 5 / 5 | Zero |
| Dispatch then dispose before awaiting queue completion | 6 / 6 | Zero; no observed GPU error |
| Leave one allocation and dispose borrowed-device renderer | 7 / 6 | Info resets to zero despite live allocation |

Counters prove deterministic destroy calls, not physical driver-memory timing.
The device is explicitly destroyed at the end. Current PhotorealWorld lets Three
own its device, so its final renderer teardown destroys that device. The real
production concern is reload/growth while the renderer remains alive.

## Local source facts

Paths below are under `web/node_modules/three/src/` in main:

- core/BufferAttribute.js:683: dispose dispatches an event only.
- renderers/common/Attributes.js:46: delete clears its data map, calls backend
  destroyAttribute and updates Info. update at :69 registers no dispose listener.
- renderers/common/Renderer.js:2773: ComputeNode disposal removes pipeline,
  bindings and nodes; it does not delete storage attributes.
- renderers/common/Bindings.js:247: binding destruction releases uniform buffers
  and samplers, not storage attributes.
- renderers/common/Bindings.js:334: storage rebinding compares attribute object
  identity, not underlying GPU buffer generation.
- renderers/webgpu/utils/WebGPUAttributeUtils.js:361: destroyAttribute destroys
  the buffer and clears backend data only. Calling it alone leaves common
  Attributes version state and Info stale.
- renderers/common/Geometries.js:185: geometry disposal releases rendered
  attributes. This is not ownership for unrelated compute-only inputs.
- renderers/common/Renderer.js:2533 and WebGPUBackend.js:2876: full disposal resets
  managers; device destruction occurs only for a Three-created device.

## Smallest proposed ownership seam

An isolated, version-pinned helper at the Three renderer boundary can call
`renderer._attributes.delete(attribute)` for each unique, successfully created
standalone storage attribute. This is a private API dependency and must be named
as such, narrowly typed and guarded—not presented as a public Three guarantee.
The prepared palette owner captures the exact creating renderer. No parallel
allocation registry, fake disposal geometry or direct GPUBuffer extraction is
needed. Palette storage allocations remain owned by that palette owner.

Disposal order/contract:

1. Stop future submissions for that palette generation; previously submitted
   work need not acquire a per-frame completion fence.
2. Dispose its compute nodes and retire/dispose all output-reading render
   consumers/bindings. Shared consumers must finish their ownership before release.
3. Delete each unique owned storage attribute through the renderer attribute
   manager. Repeated deletion is idempotent for an absent allocation.
4. Drop references. Replacements use fresh resource/binding generations. The
   probe also proves same-object recreation after compute binding disposal, but
   this is not permission to retain a live material's old binding.

Do not release the buffer beneath a live compute/material binding. The source
identity check means a recreated GPU allocation using the same attribute object
does not itself guarantee a bind-group rebuild. A full beauty/shadow-consumer
replacement test remains required in 06b; this prerequisite proves compute-only
ownership, not that integrated consumer transaction.

Unused attributes without renderer state delete as no-ops. The probe does not
claim cleanup of a partially created attribute after a synchronous allocation
exception: Attributes.update creates map state before backend creation. The
integrated admission-failure probe must pin that path, including whether creation
reached a real GPU allocation, rather than assuming the successful-allocation
helper is sufficient for every partial failure.

## Evidence provenance

The [measured JSON](compute-buffer-lifetime.json) is the original second-run output,
including allocation records and renderer accounting. The first run returned the
same counters and readback values. This report is a recommendation, not a shipped
resource-release API or closure of 06b.

The executable probes are deliberately not committed in this report-only pass.
Local disposable worktree: `/Users/david/dev/game-compute-buffer-lifetime`.
The stopped Vite server used port 5193; `node probe-lifetime.mjs` runs the counter/readback experiment.
Browser module: `web/public/compute-lifetime-probe.mjs`.
The probe changes no production entry point and is not a second canonical scene
runner. Turn the accepted lifecycle into an addressable scene when implementing
the real 06b palette owner.
