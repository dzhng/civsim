# TypeGPU conversion review

The consultation is a scoping input, not an acceptance report. Adopt its concrete
capability gaps: typed candidate High shadows, current frame resize/depth
contracts, reload and measured diagnostics must survive conversion. Public
pipeline interop can preserve the existing encoder owner; root independently
compiled matching/mismatched render and compute pass calls with TypeGPU0.12.5.
No GPU performance claim follows from this compile check.

Do not adopt these overclaims or speculative mechanisms:

- A shared root does not itself prove automatic binding indices collide between
  independently resolved pipelines. Do not create a global binding-index registry
  without an actual failing consumer. Per-layer roots borrow one device; investigate
  cache and lifetime costs before calling their mere count a correctness defect.
- Keeping the original WGSL as an oracle allows typed shader bodies to be checked;
  converting a body does not destroy the only equivalence test. The independent
  colour-function pass does this now.
- A schema size is a runtime layout assertion unless the installed return type
  proves a numeric literal. Do not pretend a numeric calculation is a compile-time
  layout proof. Negative tests should pin real misuse, not arbitrary brands that
  reject otherwise valid depth descriptors or absence of future library features.
- Most policies are already shared, but resource ownership, admission and reporting
  are behavioral code, not just missing imports. Verify those consumers explicitly.

Next capability pass: High shadows, independently from typed colour helpers.
Frame/root promotion follows a concrete ownership design, then remaining world
layers and live facade migrate into the final package. Historical raw checks
remain evidence for behavior; TypeGPU must run its own affected gates.

Further frame audit: the consultation's claim that TypeGPU resize lacks GPU
admission is false. `frameResources` opens/awaits `beginGpuAdmission` around
attachment materialization, then awaits `createTypegpuPost`, whose own resources
and pipelines are admitted before return. `resize` awaits that entire operation
before replacement. Do not add a duplicate outer barrier. The existing four
`typegpuFrameLifecycle` tests pass under the candidate Vitest config, including
failed replacement and disposal during pending resize. This finite CPU check is
not hardware validation; depth-policy/diagnostic integration remains open.
