# Live timing integration

Integrated as `2c25b775` on the branch containing the current upstream
optimization changes. The source pass's independent code and full chronology
reviews remain in the adjacent review leaves.

Merged CPU run26342: 382 tests across62 files pass; TypeScript exits0.
Merged browser run61693 exits0 with397 checks,131 exact snapshots, no page
errors. This includes the three held whole frames and128 explicitly scoped
body-motion regions, using bundled Chromium/SwiftShader at1280×800. No baseline
updates. WASM SHA256:
`04aa7834b861ce266205f1072aec5b27ac2c53eaf76191f638221392f19497ce`.
Raw report remains `throwaway/live-consumer-merged.json` in the integration
worktree. The merged images match the already reviewed candidate chronology;
root also inspected the held fractional image after integration.

This verifies presentation integration, not natural soldier art or the excluded
HUD portrait repeatability. Root reviewed the production diff: existing owners
replace residual easing in place; unit metadata and rings consume matching
presented positions; no simulation or clock authority is added. The sole merge
conflict was append-only choices documentation, resolved preserving both sides.
