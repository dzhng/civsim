# Footwear fitting candidate

Provisional footwear source pass on `4926aa16`; no model, motion, art budget,
production appearance or screenshot baseline is accepted here. Root owns the
final refit onto concurrent body and locomotion changes.

The target is a thin leather sole with a broad forefoot, narrow heel and medial
arch, plus visible straps that retain both forefoot and heel. The body's foot,
rig, surface author and motion author are fixed inputs. Sole geometry remains
the existing motion author's source for supporting-foot height, so rebuilding
after a sole change legitimately recomputes its authored grounding.

The native sheets in `before/` and `after/` use the existing production candidate
sheet helper, including its original neutral/bend, gameplay-pitch, head and hand
views. Extra existing-helper details show ready feet, ready whole body, walk
phase 0.4 and phase 0.7. Each submitted pose is checked and captured twice for
byte stability. All images go through the existing exact `snapCheck`; its
temporary baseline directory stays outside the committed baseline bank.

Both sides are rebuilt with the source and authors from `4926aa16`. The old
footwear is loaded directly from that commit; the new footwear is this diff.
The committed starting asset was not used as the comparison because its walk
predated the source's corrected pace. Cameras, lighting, material assignments,
viewport 1280×800 and bundled Chromium/SwiftShader are matched.

`compare-*.png` place before on the left and after on the right, using nearest
neighbor 2× crops of the native ready-feet sheet. `comparison.json` records exact
changed pixel counts; those establish visible change, not quality. The native
ready-feet sheet changes 89,208 pixels and the whole-body ready sheet 4,081.

Author inspection: the new footprint is less slab-like, and the sling provides
readable heel retention. The sole's cut edge remains slightly angular in native
rear close-up. The fixed body still has a simplified undivided toe shape. Body
anatomy and motion quality remain with their respective authors.

The first fresh critique caught free-looking strap tips and an ambiguous side
diagonal. A source-space clearance probe found roughly 9 mm of medial riser
penetration and excessive all-length clearance on the upper crossing strip.
The final source projects the heel pieces onto the skin too, lifts the second
vamp strip only at its crossing, and uses a shallower crossing angle. In the
standing pose, the final probe found no strap vertices more than 2 mm inside
the skin above the low sole anchors. This checks the evaluated mesh after
subdivision; it is not a universal contact or motion-quality guarantee.

Final independent critique: B is clearly less wrong; the broad diagonal now
visibly anchors to the sole, rear retention is coherent, and no gross separation
is visible in the sampled poses. No blocking footwear defect is visible. Small
tapered edges remain crop-only cosmetic concerns, not proven detached ends.
These stills cannot establish natural toe roll or gait contact quality.

Both source reviews found no blocking topology, normal, sampling or rig-binding
defect. The Codex CLI review was attempted but rejected the configured model as
requiring a newer CLI; an independent peer performed the read-only source
review instead. The candidate bake `--check` and `git diff --check` pass.
All 81 pose/admission/repeated-capture checks pass on each capture side. The
final exact image comparison fails on six intentionally changed sheets and
passes on the unchanged head/hand views. No tolerance or committed baseline
was changed. The before log also records two expected motion-sheet differences
against the initially stale temporary reference; the final comparison uses
the rebuilt before images.

The shape review kept footwear in its existing geometry owner and reused its
surface lookup and thin-surface construction. No renderer, material, rig or
motion-author source changed. The source diff adds 75 lines and removes 12;
three added lines are comments. Detailed candidate triangle counts are not an
accepted budget.

The local capture used a scratch caller of `runCandidateSheet`, not new harness
infrastructure. Root can reproduce the standard ready-feet and whole-body views
with the existing `heavy-kit` scene after integration. The build remains:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-heavy-kit.py
node packages/soldier-assets/bake/heavy-kit.mjs
node packages/soldier-assets/bake/heavy-kit.mjs --check
```

The authoring revision consumes human source SHA256
`f57dbf9ea01e05617473fe5b8f1bd03dc15078122604cc473c0e5923eee01f3a`.
Candidate GLB SHA256 is
`a07d87b8447ca998059c855f33c7abb99b44df8de3768375fa0ad0e436a3b1c5`.
