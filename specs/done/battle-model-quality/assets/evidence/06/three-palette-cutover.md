# Three production palette cutover

The production crowd now derives one joint palette per visible mesh instance,
shared by its actual beauty and sun-shadow materials. Local sampling, base and
mounted composition, frozen sources, parent metadata and inverse binds use the
shared source/kernel owners. The fixed far pose uses the canonical CPU local
decoder and hierarchy evaluator; it is not animated. This is transport and
arithmetic evidence, not final animation, art, or performance acceptance.

## Reproduction and results

From `web`, using the software adapter and an isolated Vite server:

```sh
VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5195 node scene.mjs pose-palette
VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5195 node scene.mjs battle-model-palette battle-model-normal-frame
node_modules/.bin/vitest run tests/posePalette.test.ts tests/impostorLayer.test.ts
```

The [production numerical report](palette-production-numeric.json) covers 64 poses
through the real Three palette owner and the independent raw adapter: exact
cross-substrate bytes, maximum matrix error `6.556510925e-7`, and CPU-weighted
position/normal/tangent error `4.768371582e-7`. The gate remains `1e-5`.
The [production integration report](three-palette-cutover-results.json) passes 65
checks, retaining the existing 18 mapped-normal controls and their independent
authored-track oracle. Eight focused unit checks pass.

The actual mounted composite and independently CPU-posed geometry produce exactly
equal sun-shadow depth, with 26 non-background texels. Beauty differs at one pixel
by one color level; the numerical oracle allows at most two levels, not a relaxed
regression baseline. Same-pose growth from 1 to 257 instances is byte-identical in
beauty and depth. Frozen-pose buffer growth preserves the same shadow; three
new poses upload 1584 changed bytes, repeat/shrink upload no snapshot bytes, and
reentry after retirement uploads 528 bytes once.

Two appearances with the same rig but different animation data stay separate,
while a third shares the original. A known local-root displacement agrees with
an independently translated production instance in beauty and depth. Deliberately
aliasing the distinct animation produces 49,341 pixels beyond the two-level bound
and 8 differing depth texels. Thus identity coverage is not merely a buffer count.

No screenshot baseline changed and no new art verdict is claimed. The scene's
images are in-memory numerical comparisons through the existing production
workbench, not an alternate beauty renderer. Its small depth-readback shader
only copies the actual sun depth texture into a readable buffer.

## Boundaries that changed the implementation

**Quaternion angle.** The original residual-vector angle implicitly assumed
exactly unit inputs. Valid endpoints with norm 1.000099 failed on a nonadjacent
three-joint chain at quarter and three-quarter phases: maximum matrix error
`1.819431782e-5`, weighted geometry `1.347064972e-5` in the
[retained red](palette-near-unit-red.json). The angle now computes CPU's
`acos(dot)` using `atan2(sqrt(max(0,1-dot²)),dot)`. The orthogonal/subnormal guard,
shortest arc, near-parallel branch, exact endpoints and bounded sine polynomial
remain. Quarter-phase matrix error falls to `1.788139343e-7`; no tolerance or
admission widening. The source owner separately audits the portable bounds.

**Storage lifetime.** Pinned Three does not release compute-only storage on
attribute or compute-node disposal. The adapter retires every reading material
and compute node before central attribute-cache deletion; retained bindings must
not survive their allocation. An actual pre-create failure originally replaced
the intended error with an undefined-buffer `.destroy()` error, captured in the
[allocation red](three-palette-allocation-red.json). Cleanup now distinguishes
unversioned common-cache records, optionally destroys a registered backend
buffer, and clears guarded accounting. Browser tracers prove both failure before
creation and failure after backend registration but before accounting, without
orphans or duplicate destruction. Initial preparation rejects while the prior
crowd and scene remain installed. Failed live growth hides the entire crowd and
its shadow; the next complete upload recovers. It never presents a mixed frame.

This is not a general GPU-allocation recovery guarantee. In installed
`WebGPUAttributeUtils.createAttribute`, the local handle is registered only after
mapped-array initialization. An exception before registration can leave a handle
unreachable from renderer caches. Fixed aligned typed arrays remove ordinary
mapping misuse; OOM, invalid allocation and device loss remain admission/fatal
GPU errors, not a promise to recover by global device interception.

**Capacity.** Required control/output bytes reject before CPU packing. Optional
doubling is bounded by legal storage and dispatch capacity; snapshot reserve is
bounded separately. The red unit request needed 16000 bytes on a 20000-byte limit,
but a 20480-byte optional reserve rejected it. It now fits at 250 records; 251
records correctly reject. No requested count is clamped or silently omitted.

## Ownership and review

`photoreal-renderer/battle/posePalette.ts` owns Three resources and the pinned
side-effect statement node; `renderer-core` owns the shared math, static rig
metadata and source-resolved playback packing. Crowd buckets own only geometry,
material consumers and palette indices. There is no second animation encoding,
per-vertex hierarchy evaluation, compatibility reader or generic GPU manager.

Full independent code review found no actionable issues. A separate follow-up
review checked the reserve boundary and near-unit angle correction and found no
issues. Shape review retained the resource owner as a coherent responsibility;
the numerical scene removed its duplicate Three compute adapter. Source/assets
and raw-consumer verification copies are excluded from this focused commit.
Whole-app typecheck requires those separately prepared source and raw commits
to land atomically with this consumer; isolated owned files have no type errors.

Payload counters report changed control/snapshot bytes, not Three's full mapped
array initialization on allocation. Capacity counters include the owned buffers;
they are not GPU-completion timings.07 must measure initial/growth transfer,
CPU packing, compute time, synchronized interruptions and hardware performance.
06c separately owns temporal rendered acceptance and legacy death-effect
continuity. Runnable placeholder horses do not establish accepted gait art.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `pose-palette` numerical scene | Disposable Three compute adapter;60 poses under1e-5 | Real production owner;64 poses, same gate and byte parity | One production resource/compute owner; admitted near-unit case exposed and fixed angle mismatch. **your-regression** |
| `battle-model-normal-frame` existing controls | Oracle indexed baked matrices; cancellation fixtures patched matrix data | Oracle independently samples authored tracks; fixtures bake identity local transforms; all18 controls and thresholds retained | Canonical local-data cutover removes matrix-animation reader without weakening normal-map coverage. **moved** |
| `impostorLayer.test.ts` admission cases | Fixed far pose supplied by old animation fixture | Explicit identity joint palette; same rejection, restoration and disposal assertions | Far baker receives an evaluated pose instead of owning a second animation sampler. **moved** |
| `posePalette.test.ts` new boundary checks | No production palette-owner checks; valid16000-byte request rejected due optional20480-byte reserve | Fitting requests accepted, impossible requests reject before getter/packing, all scopes drain including falsy throws, disposal idempotent | Tracers pin resource admission and corrected reserve semantics. **your-regression** |
| `battle-model-palette` new flow | No production composed-pose/shadow/growth oracle; initial cleanup masked injected error | CPU beauty/depth agreement, sharing negative control, changed snapshot uploads, original errors and recovery all pass | Actual consumers expose lifetime and indexing failures that compute-only probes cannot. **your-regression** |

No unit stats, simulation mechanics, model geometry, materials or lighting changed.

## Reload interrupted by world disposal

The merged disposal scene exposed an additional lifetime race, not merely a stale
assertion. Its first GPU wait now occurs during palette admission, before pending
geometry exists. Resuming after world disposal continued into atlas rendering on
the destroyed renderer and failed at `timestampWrites.querySet` before the final
world check. The [retained red](reload-lifetime-red.json) records 7 scope pops;
the [repaired repeat](reload-lifetime-final.json) stops at 4, exactly the count at
disposal, and reports the disposed-world error. Both runs retire 6 pending palette
buffers; the fix prevents subsequent work rather than just replacing an error.

The world supplies its existing lifetime assertion through async crowd, surface
and atlas preparation. Returned resources enter their cleanup owner before the
next check. No second disposed flag, cancellation framework or deferred renderer
destruction was introduced. Alive-world failures retain their original errors.
The atlas-stage case still requires real pending geometry: 3 meshes are disposed,
along with 6 pending palette buffers. Network disposal starts no GPU preparation.
Separate decode/upload-await unit tracers retain acquired-resource ownership and
prevent a second image from starting. The focused unit group now passes 13 tests.
Independent six-file review found no issues and separately reran the five surface
tests successfully; integration-owner review also found no issues.

Run from `web`:
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5195 node scene.mjs battle-model-reload-disposal`.
No screenshot or shader output changes in this correction.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `battle-model-reload-disposal` | First-GPU-wait assumed pending atlas geometry; new palette wait resumed into destroyed renderer with7 scope pops and a query-set error | Separate palette/atlas/network waits; disposed-world error, no new GPU scopes after disposal, pending buffers retired exactly once, atlas geometry cleanup remains positive | New async palette admission exposed a real missing lifetime boundary; changing the pause hook alone would hide it. **your-regression** |
| `soldierSurface.test.ts` decode/upload disposal cases | Preparation resolved and continued to later images after the world died during an await | Rejects after the wait, closes the decoded bitmap, destroys an acquired GPU image exactly once and stops later preparation | The same borrowed-renderer lifetime reaches image decoding/upload, without moving image work into a new owner. **carried-in** |
