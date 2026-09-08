# Joint hand / held-equipment fit — rejected

Seating equipment inside a shorter palm improves enclosure, but a tighter
silhouette is not enough to replace the settled hand. The independently reviewed
candidate retained four repeated angular finger bars, an upright block-like
thumb, a slab-like back and a raised transverse palm seam. Its Boolean seat
looked like a rigid hinge in empty-hand views. The next construction must author
fleshy palm support and articulated digits without relying on a visible machined
groove. This candidate is not a root checkpoint or accepted anatomy.

A is the still-unaccepted [settled closure](../power-grip-closure/review.md);
B is this folder's rejected joint-fit study. A fresh unprimed reviewer examined
six full sheets, all 24 two-times crops, earlier whole-body context and the
local supplemental Rome II reference. B was less wrong for compact enclosure,
not natural anatomy. Main and root review retained that distinction. Shield
views 0 and 3 hide the hand; the older whole-body context is not evidence of B.
Equipment placement intentionally differs, while camera/body/background framing
is matched. The pixel differences therefore include those placement changes.

## Physical scope and remaining regression

The authored grasp frame was shared by the hand and heavy-kit source. The trial
center was 74 mm distal and 27 mm volar from the wrist, with an approximately
10-degree oblique axis. Those are experimental values, not anatomical constants.
The sword assembly and shield grip moved rigidly; the shield body and boss were
unchanged. Shield supports were fitted to ray hits on the actual shield, with a
14-by-24 mm section after the original circular section intersected the thumb.

The final candidate preserved all 10,822 non-hand positions/weights, rig rest
matrices/names/parents and baked skeleton/animation JSON. The 22,940-vertex body
was one connected component with zero sampled nonadjacent hand self-pairs.
Human/heavy strict bakes passed. Sword and shield-grip topology, UVs and weights
were unchanged; maximum pairwise distance error for the complete sword assembly
was below 9.76e-8 m. No whole stale kit was promoted.

Existing hand-vs-grip/guard tests passed over 930 poses. Expanded whole-skin tests
against every intentionally moved held component caught and drove the support
correction. They also exposed clinical blade/leg intersections:

| Clinical clip | Frozen original blade: affected samples / maximum pairs | Candidate: affected samples / maximum pairs |
| --- | --- | --- |
| Bend | 112 / 55 | 108 / 54 |
| Pronation | 10 / 40 | 8 / 42 |
| Combined bend/pronation | 8 / 43 | 10 / 47 |

Thus the candidate added two combined-clip samples; it is not an all-clear result.
Ready, walk and run were clear in the expanded check. The frozen original body
has older hand geometry, but its leg geometry and rig match the retained body;
the table classifies blade/leg contact, not its obsolete grip intersections.
The sweep used ready 1, walk 109, run 97 and 241 samples per clinical clip.

A radial seat-to-outer-surface probe found a 5.64 mm minimum and 9.00 mm first
percentile over 2,606 sampled exits. This does not prove minimum anatomical
thickness everywhere or natural soft tissue. Contact and topology gates cannot
accept the visible palm seam or repeated bar-like digits.

## Provenance

Native capture 98189 used default headless SwiftShader, Vite 5193 and the focused
heavy-kit sword/shield-grip plus human-anatomy power-grip views: eight equipped
and four empty views. Root explicitly granted and received the released slot;
fresh frozen repeats were byte-stable, with no page errors. No full-body B capture
or timing acceptance is claimed. Separate read-only source review found no new
implementation defect; it did not accept the art.

- Anatomy source SHA-256: `3336626067949e5984aa3b821883ebdfbac11867db3fb9f8dfc76127e4ee3fc0`.
- Heavy-kit source SHA-256: `a99dc1bf9fd35ef0ea3692f11c9304a097af9e30f348b09e47bd92ad63a3d6ad`.
- Human GLB SHA-256: `e44fea7249cd63760e447712733676cf3c1530f1d0e2b4ba5d93132935d65ad7`.
- The patch is relative to settled `0d8f8634` source. Editable candidates, source
  copies, CPU/native logs and all crops remain in local scratch
  `throwaway/joint-grasp-study/`. Body authoring used default-thread background
  Blender against the frozen original donor, not a broad body rebuild.
- Equipment fitting used the isolated frozen `f1962716` kit. Root's newer modular
  equipment and exporter basis were neither overwritten nor accepted by this study.

The candidate is preserved only as negative evidence. Its useful compact-grasp
relationship must be reconsidered together with anatomy and the additional
clinical blade contacts before any replacement is retained.
