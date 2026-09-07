# Scabbard suspension working checkpoint

Retain the revised scabbard as a clearer attached leather sheath, not accepted
heavy equipment. The target is a blade-shaped casing suspended from the belt,
with readable straps and fittings that remain attached during the existing poses.

## Controlled comparison

The control is the combined garment checkpoint `45df6bb9`; its source GLB SHA256
is `bdad44ba83bc43042c3b69ba131443c42dbe6409eb88d9b7f03291ec9ff26ab6`.
The revised source is
`4c55e2c26bff315e2da3029f32e3d5a22841cfcbb4a9a7bb63c2f66076122a81`.
The [ready control](before-ready.png), [ready candidate](after-ready.png),
[focused control](before-poses.png) and [focused candidate](after-poses.png)
use matching production daylight, cameras, assets other than the scabbard,
frozen poses and four bearings. The new focused camera adds coverage; no existing
static or motion coverage was removed. The harness owns its camera values.
Raw RGBA comparison finds 50,922 changed pixels of 1,638,400 in ready and
448,747 of 9,830,400 in the focused pose sheet. This proves visible change, not
quality; the visual verdict below owns that distinction.

The main sheath, open mouth, bands and capped tip share one curved-section
construction. The sheath follows the pelvis; the straps blend from the waist's
existing bone influences to the pelvis near their lower attachments. Export uses
the existing weighted mesh and material atlas, without new bones, clips or runtime
mechanisms. Body records and non-leather/non-bronze material geometry remain
unchanged. The provisional source grows from 72,640 to 78,788 triangles; this is
not a measured or accepted 07 budget.

## Evidence and limits

[Capture log](capture.log), process63675: production submissions, fresh frozen
repeat comparisons and page checks pass. Ten comparisons against earlier
unaccepted local images differ; the run exits1 and no baselines are blessed.
Full walk/run phase sheets and review GIFs are archived alongside this report.
The exact candidate bake check and web typecheck pass. The CLI source-review
attempt cannot run the configured model with the installed CLI; its failure is
recorded, not represented as a pass. An independent read-only source reviewer
found the construction, material routing, normalized weights and harness wiring
clean. Root shape review retained the existing authoring owner and shared pose
table; there is no new compatibility path or dependency.

The earlier forward-hanging trial intersected the sword-side forearm during
walk. [Rejected contact evidence](rejected-contact.log) and its
[focused image](rejected-forearm-contact.png) preserve that failure. The revised
sheath sits farther behind the arm. The [dense source probe](contact.log) checks
448 samples across ready, walk, run and bend, finding no body/scabbard triangle
intersections; at most four bone influences remain normalized. This is sampled
body clearance, not proof of garment clearance, strap-to-band attachment,
self-intersection freedom or all possible interpolated motion.

Root inspected all six focused poses and all 28 walk/25 run phases at four
bearings. The final unprimed critic independently inspected both static pairs,
all six native focused crops and all 212 candidate motion views. It prefers the
candidate with high confidence: visible loops, angled straps and metal bands
make the equipment read as suspended rather than a brown blade emerging from
the belt. It found no obvious new detachment or body/ground penetration. The
apparent ankle overlap in side projection has lateral separation in other views.

Remaining defects stay open: rear straps can read as thin angular wires, the
scabbard is edge-on and rodlike from front/rear, the mail resembles knitwear,
linen hems remain rigid, and a small right-armpit irregularity persists. Still
frames establish pose continuity, not convincing movement rhythm. This checkpoint
does not complete 09 or accept the whole model. Human Preview review was opened
for the candidate ready/poses and prior ready; feedback may reopen this retention.
