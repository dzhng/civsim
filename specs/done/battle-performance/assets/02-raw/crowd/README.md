# Native mesh crowd control

The native runtime draws authored mesh tiers with the shared pose kernel, material inputs, environment and audience policy. Beauty and shadow audiences share pose slots while selecting independent mesh tiers. The depth-only caster pass is exercised; directional shadow receiving and full-world composition are not implemented here.

## Evidence and limits

Eight authored infantry/cavalry cases cover mesh tiers, clip blending, frozen-source blending, mounted upper-body masking, corpse material and death pose at one/four samples. All static cases have exact coverage, no GPU/page errors, and zero owned textures remaining after disposal. The corpse-material case deliberately retains an upright pose; the separate death case exercises falling units. These controls do not establish settled corpse behavior by themselves.

The exploratory one-byte HDR diagnostic remains **red**. Every one-sample color error falls on an independently rendered primitive boundary within its aligned 2×2 fragment quad. The isolated-triangle probe localizes a batch-dependent derivative effect; it does not prove the compiler mechanism. Four-sample cases differ at zero to three color pixels; one far-mesh point cannot be classified by the one-sample primitive mask. No numerical cutoff or inherited regression threshold was relaxed.

Twelve small camera steps at four samples retain close image agreement. Two sample-coverage differences remain: motion-00 pixel (214,287), alpha128 versus191; motion-10 pixel (271,159), alpha0 versus64. Each is one of four samples. The report's binary coverage count uses alpha>0.5, so this separate alpha audit is necessary to describe the complete result.

Fresh unprimed review inspected every four-sample static pair and camera sequence. It found no visible candidate-only missing models, pose corruption, detached equipment, structural coverage loss or increased sparkle. Both paths share conspicuous pale triangular torso facets and coarse shields/horses in lower mesh tiers. Component fidelity is sufficient to continue scene integration, while the exact numerical report and full-scene/performance gates remain open. A twelve-step frozen-pose sequence does not establish real-time camera smoothness or animated skinning quality.

## Reproduce

Serve `apps/battle-perf-lab/src/raw/crowd.vite.config.mts`. `verify-crowd.mjs` accepts `CROWD_CHECK_URL` and `CROWD_EVIDENCE_DIR`; use `?samples=4` for multisampling and `?samples=4&motion` for the short camera sequence. Default is the eight one-sample cases. A nonzero verifier exit preserves the exploratory numerical failure.

The diagnostic modes expose geometry normals, UVs, derivatives and primitive identity. `?vertex=quad` compares same-fragment U, dU/dx, dU/dy and geometry roughness; adding `&triangle=22062` keeps only that original tier-zero triangle without changing vertex arrays or instances. `?vertex=primitive&deindex` gives triangles unique IDs and writes their maps for independent boundary classification. Float32 diagnostic output requires one sample. These probes change the output shader and cannot be treated as the same execution as beauty.

Independent code review found a stale canonical diagnostic camera matrix and ambiguous output-directory URL resolution. Both were corrected; focused typechecking and the existing pose/image-transport tests pass. GPU resource ownership and broader lifecycle behavior still need the full-scene acceptance checks.
