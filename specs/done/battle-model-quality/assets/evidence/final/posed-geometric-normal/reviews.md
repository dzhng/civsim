# Independent review record

These are the final verdicts from separate read-only Codex CLI reviews, captured
2026-09-08. Neither reviewer changed files or ran GPU work. The source review
preceded the successful causal probe; its pending-verification limitation is
retained rather than rewritten as retrospective approval.

## Source review

Session `01a08161-1d9f-7231-ab75-34200f7c0849`, process 71291, exit 0.

> **Clean static-review verdict:** no concrete defect found in the eight-line fix at crowdLayer.ts:578.
>
> - Three.js 0.185.1 builds the position stack before shader flows. Assigning `normalLocal` there follows native skinning’s pattern and feeds geometry roughness before its varying is emitted.
> - `worldN` matches the existing posed/facing position coordinates. These are ordinary meshes with transforms encoded in attributes; native skinning or instancing won’t apply them again.
> - Shadow overrides inherit `positionNode`, whose returned position is unchanged. Received-shadow position and custom shading normals remain unchanged.
> - Normal-map tangents, DoubleSide behavior, and surface inputs remain intact; geometry roughness now receives the posed geometric normal.
>
> **Limits:** read-only source review; no edits, tests, shader capture, or GPU execution. The reported 33 tests and typecheck were not independently rerun. The existing CPU-preposed/GPU ≤1-channel gate remains the acceptance check, pending the parent GPU lease.

The review prompt reported the initial focused test subset. The implementing
agent subsequently expanded it to the 58-test result recorded in the evidence note.

## Neutral image review

Session `01a08167-2d67-7342-86bb-97c5db47669e`, process 90569, exit 0.
Input was limited to [A](before/on-gpu.png), [B](after/on-gpu.png), and the
[A-left/B-right crop](ab-crop.png), with no implementation context.

> - **Content and pose:** Same character, equipment, framing, and raised-arm pose. No visible silhouette or alignment change. **High confidence.**
> - **Shading:** A and B appear essentially identical, including the warm left-edge lighting, blue-gray arm shading, and torso gradients. No clear improvement or regression in the crop. **Moderate–high confidence.**
> - **Artifacts:** Both show stepped pixel edges and an abrupt dark patch at the bent elbow/sleeve opening. No obvious new holes, spikes, or displaced geometry in B. **High confidence for conspicuous artifacts; subtle pixel differences remain uncertain.**
