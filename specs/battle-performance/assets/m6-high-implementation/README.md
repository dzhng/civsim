# High implementation checkpoint

Claude c1e78391 is integrated as b89a806a. Independent review found no actionable
regression; it ran31 focused cascade/shadow/lifecycle tests and TypeScript.
Root inspected the merged scene, packing and shaders; M4 admission fixes remain.
Hardware validation and merged checks are still pending. Worker reports of broader
tests retain their sparse-checkout campaign fixture failure and existing format/
lint failures; they are not a clean full-suite verdict.

The shared policy reproduces the reviewed CSM contract; the raw owner allocates
mode-sized depth arrays and distinct caster camera buffers. Single and High share
the receiver block; discarded lab backends consume its first record with their
existing single-map texture binding. Root accepted this resource-shape difference
because the sampling math stays single-owned and no High compatibility path is
introduced. Cold fits and moving camera fits use the current camera before crowd
admission, not the source's delayed cascade update.

Root corrected a shader comment: a negative reverse-depth comparison can shadow
an out-of-volume receiver against cleared depth; it does not make it lit. Code was
already guarded. No shader instruction changed in this correction.

No GPU or visual acceptance is claimed. The unchanged-camera path recomputes its
candidate cascade fit before avoiding unchanged uploads; no allocation-free or
measured CPU saving is claimed. Per-cascade union draws are repeated caster work
and must be priced separately. Default single cost and High cost stay distinct.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| nativeShadowFrame: native camera packing follows the real Three rig through zoom and terrain replacement | Compared single-map matrices, culling planes, normal bias and unchanged upload identity | Same comparisons and tolerances through cascade record0 and explicit single mode | Resource representation changed; the original single-map numeric contract remains. moved |

Three further frame tests were added, alongside pure cascade, resource and scene
coverage. Existing nativeSceneLifecycle, TypeGPU lifecycle and vgpuScene fixtures
changed their off-mode input from false to "off"; their outcome assertions stayed
unchanged. No simulation stat, golden or pixel threshold changed.
