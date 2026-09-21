# vgpu soldier impostor control

This candidate uses the same packed instances and shared billboard, atlas sampling, faction and material algorithms as the raw component. Its own library allocates resources and creates pipelines, bind groups and draws. The adapter owns frame submission and render attachments; the component borrows the device, camera and environment. It retains the source single-pass non-invariant clip contract, alpha cutoff, depth writes, size floor and shadow flags.

The shared environment uses vgpu sky, PMREM, DFG resources and uniform bindings. vgpu owns geometry, textures, pipelines and Frame/Target encoding. Its pinned 0.5.0 API has no texel upload operation, so public `GPUQueue.writeTexture` uploads bytes into vgpu-owned atlas and DFG textures. This narrow upload interop is explicit; no raw render pipeline or submission fallback is used. Offscreen targets expose public runtime `destroy()` omitted from the published Target type; the shared cleanup helper verifies that method before using it.

The unchanged Three oracle covers three actual appearances across oblique, overhead, overlapping hostile-order and distant-floor views. Both one-sample and four-sample matrices pass all twelve cases: exact packed attributes and resolved alpha, maximum covered HDR RGB difference 0.000244140625 (gate 1/255), no exceptional pixels, and zero GPU/browser errors or warnings. Empty upload, incomplete-mip rejection, repeated disposal, disposed-use rejection and borrowed-resource survival pass. Real device texture accounting reports zero live candidate textures after backend disposal in both matrices. The raw baseline also passes after the shared algorithm extraction.

The final pass used the pinned dependencies and Apple Metal 3 adapter recorded in each report. Typechecks and the control build passed. Independent code review found that vgpu offscreen target attachments outlive a borrowed-device context; explicit public-runtime target destruction fixes that ownership defect, and the final accounting gate verifies it. Shader and sampling policy were unchanged by that fix.

These are component numerical results. Fresh visual critique of the new candidate pairs remains with integration; source appearance limitations are documented in the [raw control](../../02-raw/impostor/README.md). The input still consists of captured production atlas mip chains. Verified offline generation or native baking, full scene composition, shadows through the separate mesh audience, and performance comparison remain required before backend eligibility.

Reproduce with the existing impostor control server, selecting `candidate=vgpu` and `samples=1` or `samples=4` in `IMPOSTOR_CHECK_URL`, then run `node apps/battle-perf-lab/src/raw/verify-impostor.mjs`. Candidate selection changes orchestration only; it does not change cases or tolerances.


## Independent visual review

A fresh reviewer inspected all twelve four-sample pairs at native resolution and in enlarged subject crops without reading the numerical reports first. Candidate and control were visually indistinguishable, with identical foreground coverage; only twelve RGB pixels differed across each backend's set, by at most one byte. Both share disconnected class-3 weapon fragments and floor views too small for useful model-detail judgment. This accepts component image equivalence only; black-background controls cannot establish battlefield grounding, motion, shadow integration or performance.
