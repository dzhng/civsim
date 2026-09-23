# Exact snapshot contract

Zero threshold and zero permitted difference mean decoded RGBA equality. Perceptual comparison alone can ignore a changed antialiased edge or RGB beneath zero alpha. The exact path counts every changed RGBA pixel; tolerant comparisons keep their existing perceptual behavior.

The new edge regression failed before the fix (reported matched), then passed. Both edge and transparent-RGB mutation cases now report failed, as required. All six snapshot tests and the full 454-test suite pass. Seventeen focused campaign composition, terrain, join, anchor and water captures repeat at zero changed RGBA pixels. No baseline was refreshed because of this checker correction.

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| exact snapshots reject changes on antialiased edges | A 128→129 grey edge pixel was reported matched. | One changed RGBA pixel fails. | Exact mode bypasses perceptual exclusions. **carried-in** |
| exact snapshots reject changes on transparent RGB | Perceptual equality could ignore different RGB under zero alpha. | One changed RGBA pixel fails. | Compare the same decoded bytes used by baseline refresh. **carried-in** |

Independent Codex review found no checker issue. Its separate terrain-bounds finding was dismissed after inspecting the consumer: ground meshes disable frustum culling, and the installed Three renderer honors that flag for the normal and shadow camera render paths. No bounds calculation is needed for those meshes. Roads do use bounds and already recompute them after terrain admission.
