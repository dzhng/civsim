# Raw authored texture consumption

## Scope

The retained raw campaign/lab renderer prepares complete surface resources
asynchronously. Base-color textures multiply linear authored vertex/factor
colors after one GPU sRGB decode. Metallic/roughness consume G/B independently
of occlusion's R/strength. Normal images are decoded/uploaded and their sampler
is bound, but 04c still owns posed tangent-space shading; no normal fidelity is
claimed here. Existing scalar lighting and the three accepted captures remain
unchanged.

Each complete surface owns one material binding shared by its three detail
levels. Sharing a scalar array does not imply sharing images. Encoded inputs
remain untouched; this prepared owner decodes its own bitmap, closes it after
checked upload, and releases all prior allocations if a later decode/upload or
GPU initialization fails. A synchronous initialization segment brackets tables,
samplers, geometry and pipeline creation with GPU error scopes; scopes are
popped before any await. Draw/upload remain synchronous after preparation.

## Verification and review surface

Run the focused unit test through `bun run --cwd web test skinnedPipeline`, and
typecheck through the existing web task. With this worktree's Vite server, run
from `web/`:

```sh
VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5185 node scene.mjs soldier-materials
```

The scene uses the actual catalog loader and raw production factory. Browser
network fixtures vary source PNGs/flags/factors, not shader internals. Constant
base and MR images agree with independently authored scalar equivalents within
one byte. A two-axis asymmetric texture agrees with an independently colored
vertex gradient within one byte; this catches UV flips/rotations that a symmetric
checker cannot expose. Independent MR/AO flags, zero AO strength, normal
transport-only behavior, non-mip allocation and unchanged draw count are pinned.
Flipping only shader V as a mutation changes the gradient comparison from one
byte to 55 bytes and fails it; scalar checks remain green. The mutation was removed
before final verification.

The Blender checker shot uses the committed human GLB's baked candidate through
the same raw route. Matched comparison disables only the source texture for
the reference. The candidate is less wrong for **authored texture transfer**:
the shield now carries its source checker. Geometry/framing do not change.
Full-frame distance 0.01941 and grayscale MAE 1.14897 locate that new pattern;
they are not an aesthetic score or a standard-PBR comparison.

The independent code review found a campaign initialization teardown race at the
new async factory call. Preparation now finishes before synchronous passes are
allocated, checks destroyed state at each await boundary, and releases the local
crowd and shell if teardown wins. A public renderer regression holds preparation
pending, destroys the renderer, then completes preparation: readiness remains
false and both owners are disposed exactly once. Follow-up review confirmed the
lifecycle behavior and identified a test-only TypeScript cast; the cast was fixed.
No review findings were dismissed.

Focused units and typecheck pass. The full raw material scene passes all checks
and all four snapshots with zero differing pixels. Hardware Chrome's campaign
model scene passes all 15 content cases after the lifecycle fix; its selected
army snapshot passes the existing tolerance (4,310 differing pixels, 0.5862%).
No campaign or existing scalar baseline was rewritten.

## Fresh unprimed critique

- High confidence, both: Candidate adds a clearly readable checker pattern across the entire visible front panel. Roughly eight repeats span its width; edges follow the panel’s perspective without obvious stretching or missing patches.
- High confidence, both: Geometry, panel silhouette, connecting bar, terrain, and UI placement remain visually consistent. No new clipping, depth overlap, holes, or detached texture regions are visible.
- Medium confidence, crop: Candidate’s thin top face loses the reference’s bright cream appearance and becomes dark/patterned. This reduces separation between the top and front faces, making panel thickness less obvious.
- High confidence, full: The rightmost navigation label is cut off at the viewport edge in both images; this is shared, not introduced by candidate.
- Orientation limitation: A symmetric checker verifies alignment and scale, but cannot establish whether UVs are mirrored or rotated by 90°.

Disposition: the top face uses the same source checker material/UVs as its front,
so its changed contrast is faithful diagnostic content, not a new geometry
defect. Final material/shape readability is not accepted from this fixture.
Navigation clipping is inherited and outside texture transfer. The additional
asymmetric gradient oracle addresses the review's orientation limitation.

## Choices

- **Sound, medium confidence:** preparation visits distinct surfaces/images
  serially. If a later decode fails, all earlier GPU resources already have an
  owner and are disposed immediately. This avoids late successes after a rejected
  parallel batch; startup measurements may later justify bounded parallelism.
- **Sound, high confidence:** one neutral image per absent channel per pipeline
  keeps fixed bindings without adding material draw calls. A declared image never
  falls back after failure. Slot usage flags, not neutral-image color, determine
  which channels affect a surface.
- **Sound, high confidence:** complete-surface identity owns bindings. Two units
  with equal scalar arrays but different images get distinct bindings; their
  material factors cannot accidentally select the other unit's texture.
- **Sound, medium confidence:** the existing raw diagnostic accepts catalog and
  clip selection, admitting the Blender candidate without another renderer route.
  Its ordinary defaults remain unchanged; missing requested appearances/clips fail.

## Change ledger

| Test | Previous | New | Why |
| --- | --- | --- | --- |
| raw GPU boundary | Synchronous construction, two-row scalar tables, disposal/rollback and geometry/VAT checks. | Async preparation and three-row flags table; preserves geometry/VAT/index/terminal checks; additionally pins complete-surface separation, image closure and later-decode rollback. | Texture ownership belongs to the production factory. |
| soldier-materials | Three scalar screenshots and mask/seed/scalar probes. | Existing screenshots remain exact; texture/scalar and asymmetric UV oracles, independent ORM flags, sampler mip count, deferred-normal and draw-count checks added. | Actual authored channels must reach the retained consumer. |
| Blender checker screenshot | No raw texture checkpoint. | One fixed source-candidate capture, reviewed against the same surface with its texture disabled. | Retains visible proof through the actual raw route. |
| campaign initialization teardown | No pending crowd-preparation cancellation check. | Destroying during async preparation prevents readiness publication and releases both local GPU owners exactly once. | Async texture preparation adds a teardown window. |

The integrating task owns canonical surface/schema files, generated asset outputs,
Three/far wiring, combined Preview feedback, and 04b closure. This commit does not
claim those broader gates or change campaign baselines.
