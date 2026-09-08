# Heavy support travel and run recovery

Working motion comparison, not completed locomotion or accepted art. The target
is a loaded soldier with stable support and a visibly recovering leg at the real
class-independent walk floor and authored run pace. Equipment, body form and
production lighting are held fixed; the Rome II reference sets the naturalism
target, not a pixel baseline.

## Isolated comparisons

**A** is the retained combined heavy (`cd332a02…`). **B** (`fd6a8d11…`) accounts
for the rig's angled rest thigh/shin chain when authoring thigh rotation. **C**
(`777d2687…`) additionally increases the run recovery knee key at phase0.50 from
1.35 to1.75 radians. These are original Blender-authored keys; runtime skinning,
simulation travel, cadence and equipment geometry are unchanged. Full source
hashes are in [combined controls](combined-recovery-controls.json) and
[B/C controls](recovery-controls.json).

The imported rig, mesh positions, indices, normals, weights, material fields,
inspection clips and ready clip remain exact against A. Seventeen tangent scalars
vary by at most0.000100017 on re-export. An unchanged-source
[control export](original-reexport-controls.json) also varies sixteen tangent
scalars at that scale; this establishes export rounding, not a general exemption
for unexplained mesh differences. No exporter tolerance was changed.

## Ground-relative measurements

[A](current.json), [B](candidate.json) and [C](recovery.json) sample the real
imported local tracks and skin at eight substeps per authored30Hz frame. Sole
selection and flat support intervals are frozen in those reports. Walk forward
sole-center range decreases from about3.6mm to0.23mm; run decreases from8.7mm to
0.60mm. C preserves B's support measurements and increases maximum recovering
minimum-sole height from12.9cm to17.4cm. Slight floor penetration remains:
up to2.31mm walking and2.63mm running. These numbers do not accept contact or
locomotion across speed ramps.

The [independent Blender ankle measurement](leg-authoring-check.json) covers
sixty combinations of side, knee flexion and forward displacement. Maximum error
is1.75 micrometers. An initial scratch1-micrometer assertion failed; the final
report is a measurement, not a claimed passing regression test.

## Production images and fresh critique

Each capture folder contains136 original gated PNGs, raw checks and four20fps
two-cycle GIF derivatives. The existing `_heavy-travel.mjs` scene helper owns
fixed1280×800 viewport,1024×640 image crop, camera,1.7/3.23m/s travel and clip
sampling. All captures used bundled Chromium/SwiftShader with frozen clocks.
A passed417 checks; B and C each have136 intentional pixel differences against
A and no other check failures or page errors. These comparison images are not
blessed production baselines. The [B/C pixel report](recovery-pixel-diff.json)
shows all72 walk frames exact and49 of64 run frames changed.

Root inspected every A/B frame and every changed C run frame in ordered native
world strips; C's walk frames are byte-identical to inspected B. Fresh unprimed
A/B review found no convincing overall winner: small ankle shifts are visible,
but both still look upright and low-recovery. Fresh unprimed B/C review covered
all128 run poses and ten4× leg/hip crops. It prefers C's recovery with high
confidence: the folded rear knee and lifted sandal read less like a shuffle.
It does **not** accept the overall run.

Remaining visible findings: cramped side-projection foot pass around03/19,
mechanically cautious torso/hip/arm response, soft striped ground shadows, and
a closer calf–scabbard-tip projection in C oblique00. The independent
[exported-surface check](independent-glb-surface-report.json) finds zero triangle
overlaps between body/sandals and scabbard at that exact submitted run phase0.
It independently reproduces all served runtime meshes, skeleton and animation.
[Source/merged comparison](independent-source-surface-report.json) matches every
relevant modular vertex and bone weight exactly; the GLB pose differs by at most
6.88micrometers after accounting for export orientation. The full-cycle
[193-sample modular check](recovery-scabbard-visible-contact.json) also finds zero
overlaps. This supports a projection-only explanation of the reviewed tangent;
it is not a continuous collision proof or an independent GPU shader test.
Shadow rendering is unchanged and is not solved by these keys.

The focused review poses were opened together in Preview for non-blocking human
feedback; unrelated sessions' windows were left untouched. After more than five
minutes without feedback, root chose C for its better recovery silhouette and
closed only that owned window. This is a reversible intermediate decision, not
assumed user endorsement. The C source now replaces the combined heavy source
without rerunning the procedural gear builder.

## Integrated candidate regression

The existing `heavy-kit` scene exercises the composed source through the
production loader, skin and environment. Run from the feature worktree:

```sh
env -u VERIFY_GPU_ADAPTER -u VERIFY_BROWSER_CHANNEL -u UPDATE_SHOTS -u SNAP \
  VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs heavy-kit
```

The [first complete run](integrated-first-complete.json) passed1,080 checks with
no page errors. Thirteen sheets repeated exactly;137 snapshots were newly
created, so that run alone did not establish complete baseline repeatability.
An earlier incomplete run stopped on a navigation during capture and is not a
passing result. The [full repeat](integrated-zero-repeat.json) passes all1,080
checks and all150 snapshots at exactly zero differing pixels, with no page
errors. No tolerance, freeze behavior or existing baseline was weakened.

Root inspected all112 walk and100 run poses in ordered four-angle pages, both
fitting sheets, ready, formation and all close/detail sheets. All136 integrated
travel PNGs are byte-identical to the previously inspected C originals archived
here. Thus the prior complete travel review applies without inferring visual
equivalence from the asset hash alone. The full-speed C run GIF was also surfaced
inline to the user. Occluded grip angles, unfinished hand/head form, coarse mail
and restrained upper-body response remain known limitations, not accepted art.
Active candidate snapshots live in the harness-owned heavy-kit folder; these
are a reproducible intermediate state, not production-catalog promotion.

Source review found no actionable issue in the rest-chain equation or frozen
ready calculation. The CLI review could not start with the configured model on
Codex0.144.4; a separate read-only agent reviewed the diff as fallback. No tool
upgrade, model override, new runtime mechanism or existing gate change occurred.
