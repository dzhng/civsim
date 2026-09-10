# Choices made during the production spike

All entries concern the actual-kernel integration pass. Review the scope and TypeGPU experimental API first. No user-only decisions or unsound choices remain in this pass.

## Sound — medium confidence

### Share soldier skinning, retain each frame renderer
When a soldier vertex is drawn, four animated joint matrices are blended into one transform. Both game renderers need that same operation, so the experiment replaces it in both, while battle keeps Three.js materials and campaign keeps its raw WebGPU pipeline. A full replacement would also change resource scheduling, materials and culling, making failures harder to attribute. The prompt asked for actual rendering logic but did not choose the size of the port. This scope tests genuine shared logic; it does not establish that either library should own the whole renderer.

### Use TypeGPU's experimental raw-code bridge
The campaign shader already owns its storage buffer. TypeGPU's generated function refers to that existing buffer through `~unstable.rawCodeSnippet`; the Three.js version specializes the same kernel with a storage accessor. Passing a storage pointer through the Three bridge lost its storage origin in the isolated probe. The prompt did not specify how to cross this boundary. This is sound for a pinned experiment, but upgrades can break it; adopting the library would inherit that dependency. The alternative is making TypeGPU own more of the campaign pipeline, a larger experiment.

## Sound — high confidence

### Select the implementation when starting or building the app
A native server and two candidate servers load the same game with different kernel modules. Players do not receive a new settings switch. The prompt required a separate spike but did not prescribe selection. This keeps unused candidate runtimes out of the selected bundle and makes the reference reproducible. Each server has its own Vite cache because sharing the cache caused an outdated-dependency load failure.

### Preserve storage bytes and renderer ownership
The native raw pipeline sees matrices; the candidate kernels see four consecutive vector columns per matrix. The uploaded bytes, joint indices and four weights are identical. The prompt did not choose a storage representation. This keeps palette generation and animation ownership unchanged and enables one function to serve raw WGSL and Three.js. It avoids conversion buffers and an extra copy every frame.

### Pin candidate versions and use their Three.js bridges
The spike pins TypeGPU 0.12.5, its Three bridge 0.12.1, vgpu 0.4.1 and the corresponding build plugins. A generated shader function enters the existing Three material through each library's bridge. The alternative is maintaining a separate hand-translated kernel per renderer, which would weaken the unification test. Version pins make experimental behavior reproducible; they are not an upgrade policy for main.

### Separate equivalence evidence from performance evidence
Close-ups assert that real meshes and shadows draw, then compare frozen frames. The standing 30k gate separately exercises the whole game and retains its existing budget and content floors. At distant zooms many soldiers are impostors, so 30k simulated soldiers are not reported as 30k visible skinned meshes. Hardware captures remain diagnostic artifacts outside canonical software baselines. This choice prevents a passing distant screenshot or a small diagnostic benchmark from standing in for actual production coverage.
