# TypeGPU camera-independent impostor candidate — not adopted

Candidatefc446726 compiles actual typed GPU derivation from6 soldier floats plus
a48-byte view block. Camera-only audience refresh no longer republishes per-soldier
records. Root's fixed-build GPU check has no validation/page errors:786 probes on
8x8 and564 on6x4, plus a second camera from a uniform-only write. No non-boundary
tile differences occur in these probes. Exact bisectors choose different tiles in
32/5 cases respectively (dot margin at most2.22e-16); the worker's tolerance gate
accepts these, so its passed flag is NOT unconditional tile equivalence.

The actual rendered source control, canonical projection with published offline
atlases and1 sample, passes all12 existing cases for classes0/3/6: no coverage
mismatches or RGB differences over the unchanged1/255 threshold. No timing claim.
Broader moving camera/LOD/image and net-performance acceptance remain open.

Root found a verification-meaning problem not raised by independent review:
layer.update returns the CPU packer only to keep the old control interface, so
packingEqual no longer compares the candidate's actual derived records. The actual
images above are still GPU render comparisons, and the separate compute control
runs the real typed function, but neither makes that old field honest. An Opus
follow-up now replaces the compatibility return with opt-in actual installed
state/view GPU readback and explicitly migrates the TypeGPU record gate. Raw/vgpu
packing checks and every existing image/coverage/lifecycle threshold must remain.
Do not adopt or claim preserved tile decisions from the initial passed flag.

Scope correction: the48-byte bound is the layer view setter/final audience refresh,
not the whole moving-camera path. `CrowdViewState.matches` compares the actual
frustum and projection, so a camera move calls `audience.reproject` and republishes
state for the regrouped audience. Expensive billboard derivation moves to the GPU,
but CPU preparation and state upload still scale with population. Measure the
complete scene frame, never infer a constant-time camera from the setter test.
