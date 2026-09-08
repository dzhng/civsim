# Heavy running sword carriage

Retain a more compact sword-arm pose as an intermediate improvement, not finished
locomotion. The shield arm, torso, lower-body motion and all other clips retain
their authored motion. Full integrated repeat passes all150 snapshots exactly.

The target is a carried weapon with a readable, supported silhouette during the
existing3.23m/s run. Raising both forearms made the shield tilt like a tray and
was rejected: [first contact](rejected-both-arms-00.png) and
[later pose](rejected-both-arms-06.png) show that static defect. This pass changes
only the sword upper-arm/forearm directions and
their existing elbow-volume helper. It adds no controller, runtime IK or rig.

## Source and controls

The prior combined GLB is `777d268702d017bc8c99d3c1967f3ac8462ed23becc937382f53165abd71679e`.
The reviewed isolated sword-only GLB is
`803eb122ac8b12c06e7b5e0d317a99872f476a7f6639fe36aa86c77d98bba831`.
The direct production-authoring recipe exports
`06b4e5eb702fe6cb9f5a92e796be14623e7a47a89c65ab66034e0d36ed354474`;
its rig and every clip match the reviewed prototype exactly, as recorded in
[integration controls](run-sword-integration-controls.json).

[Source controls](run-sword-carriage-controls.json) preserve the prior rig,
positions, normals, weights, UVs, topology and material fields. Twenty tangent
components differ by at most0.000100017 on re-export; this is not a claim of
bit-identical mesh bytes. All non-run clips are exact.
[Track controls](track-controls.json) isolate the intended right-arm changes.
The exported right-hand STEP transform also changes at floating-point scale
(maximum1.2e-7), so the first strict three-track-only assertion failed; it is
not recorded as passing evidence. All remaining run tracks are exact, including
the shield arm, pelvis and legs.

[Contact sampling](contact.json) checks blade, guard and pommel against body,
tunic, mail, shield board and helmet at193 subframes over the loop, with no
triangle intersections. It excludes the grasped grip and is a sampled modular
surface check, not continuous or GPU-skinned collision proof.

## Production-rendered comparison

[Capture checks](capture/checks.json) pass197 checks with no page errors;
all64 run frames repeat exactly after redraw in bundled Chromium/SwiftShader.
The existing workbench and travel helper supply the fixed1280×800 viewport,
1024×640 crop, camera, phase and prescribed root speed. No existing baseline was
re-blessed for this isolated comparison.

[Comparison metrics](comparison/metrics.json) record crop bounds and real pixel
differences. Each side/oblique sheet has the prior on top and candidate below;
left-to-right groups cover all32 frames in each view. Prior full frames remain
in the [support/recovery record](../heavy-contact-recovery/review.md).
Root inspected every frame of both views and both versions. Full-speed
[side](capture/travel-derivatives/run-side.gif) and
[oblique](capture/travel-derivatives/run-oblique.gif) GIFs derive from those
deterministic frames; the side loop was surfaced to the user.

Unprimed reviewer `joint_and_motion_fresh` independently inspected all eight
comparison sheets and full scene context. Verdict: candidate less wrong for
sword carriage/readability, moderate-high confidence. The raised hand and
upright blade reduce broad sweeping and repeated disappearance into the shield
silhouette. Root agrees. Neither version establishes convincing equipment
weight: torso response remains weak, the shield is held forward/down, the
scabbard looks rigid, and the shield hand remains hook-like. These remain with
the anatomy, equipment and locomotion owners; this verdict does not close11.

## Closeout boundaries

The [first integrated run](integrated-first.json) exercised all1080 checks with
no page errors. Its69 old-baseline differences are exactly64 run-travel images
and five sheets containing run poses; the other81 snapshots were unchanged.
All64 integrated travel PNGs are byte-identical to the independently reviewed
prototype. Root inspected all25 consecutive four-view run rows and all six
changed rows in the formation, garment and scabbard sheets. Unchanged rows in
those sheets are byte-identical. The raised sword remains readable without a
new visible equipment crossing; angular elbows, stiff carriage and rigid
scabbard remain provisional. Exactly those69 reviewed images were updated,
without changing any checker, camera, tolerance or default coverage.

The [full repeat](integrated-repeat.json) then passed all1080 checks, all150
snapshots at zero pixel difference and no page errors. Run from `web/`:

```sh
VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node scene.mjs heavy-kit
```

The normal `node packages/soldier-assets/bake/heavy-kit.mjs --check` also passes.
This checkpoint pins the reviewed intermediate sword pose; it does not accept
natural anatomy, overall locomotion, distance tiers or the animated budget.

The implementation remains in the existing Blender motion owner; the isolated
prototype wrappers and capture scripts stay in ignored scratch. No new runtime
API, geometry owner, simulation behavior or test expectation is introduced.
The pose choice is within11's delegated upper-body secondary-motion budget.
The CLI review attempt failed before inspection because Codex0.144.4 cannot
run the configured model; it supplied no code-review verdict.
The independent read-only fallback reviewed the source formulas and found the
left arm's arithmetic unchanged, periodic right-arm targets, and no changes to
other clips. Root's shape/diff review agrees: this costs five added and two
removed authoring lines, with no runtime mechanism. Generated asset changes
come from the normal exporter and both catalog copies, not manual JSON edits.
