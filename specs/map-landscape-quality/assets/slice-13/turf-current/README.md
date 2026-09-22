# Current battle turf verification

Status: harness migration verified. The [complete run](full-checks.json) passes52
checks, including six exact cold-boot comparisons and exact substrate pan return.
All four edge snapshots also match the earlier independent captures exactly.
Independent static review then found a CPU/GPU publication race in the readiness
predicate. The final gate requires a subsequent completed frame at the same
finished generation. A [negative-control probe](publication-probe.json) shows
that the earlier predicate accepts an unconsumed publication, while the fix
waits correctly across both a completion and a generation change. The
[post-fix production dirt-edge run](publication-repeat.json) passes and matches
exactly. The52-check full run predates this final wait hardening; the added wait
has scoped live coverage here, not a second full-scene replay. This accepts the
current test consumer, not overall landscape art.

The harness now reads the production TypeGPU completed-frame camera and grass
residency. Explicit grass-bearing layer isolation also waits for residency;
substrate-only isolation does not. Snapshot calls require zero pixel differences.
A bounded completed-frame progress check distinguishes slow software rendering
from a stalled rebuild. Unknown edge-profile names fail before browser creation,
so a typo cannot silently pass with no captures.

The four edge controls pass17 checks and [repeat exactly](edge-repeat.json).
Root and independent visual review find no holes or displaced terrain layers.
The scree outline improves, but close soil remains smooth and grass appears as
thin dark lines/stipple at distance. The diagnostic's flat rectangular ground,
rulers and empty sky are intentional; these images do not prove full scenery
composition or reference quality.

## Baseline provenance

The old road-edge image dates to978a13b7, before971cb1c0 intentionally removed
the0.018m blade-width floor to keep grass below soldiers' knees. The user's thin,
short-grass direction is recorded in the [living-meadow decisions](../../../../done/living-meadow/choices.md).
Current TypeGPU blade width, taper, bend, normal blend, packed seeds and single
sRGB conversion match the final pre-cutover Three implementation. That static
comparison does not prove complete lighting equivalence. Restoring oversized
old blade strips would undo the later requested scale change.

The old camera also used pitch.24 and an overzoom extension; current pitch and
clamping differ. Identical URL zoom arguments therefore do not establish matched
rendered cameras. New evidence records the actual completed camera.

The fixture's road and scree use tint6, whose shared CPU grass policy admits16%
density. Grass visibly inside the road is inherited authored semantics, not a
missing TypeGPU exclusion mask. Whether to reduce it is a separate policy choice.
Mud blocks grass. The all-zero fixture height explains flat geometry, while flat
material appearance remains a visual limitation.

## Current image evidence

The four close/RTS full and isolated captures also [match the earlier run exactly](profile-repeat.json).
Both top-down captures repeat exactly across independent cold boots in the full
run. [Raw pixel measurements](pixels.json) describe the changes from historical
canonical images, retained under [before](before/). The older default pixelmatch comparison reported44/24 residual
pixels for top-down views, but that was tolerance-filtered: actual raw differences
are about952,000 pixels, with RGB mean differences3.14/2.99. No claim of near-exact
old baseline preservation follows from those tolerance-filtered numbers.

Fresh overview review confirms preserved terrain, water, army and vegetation
layers, improved pond clarity and removed thin stair-stepped material outlines.
Dirt patches still read as bounded cutouts with repetitive texture. Army placement
and palette differ from the historical full image; those images span prior game
and renderer changes and do not isolate a turf cause. Foggy weather is intentional.
The material and composition limitations remain in07/10/13 rather than being
hidden by baseline adoption. Canonical images are under
[ground-turf](../../../../../web/shots/battle/ground-turf/).

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Completed camera, every capture | Retired Three readiness and fixed delays | Actual TypeGPU published camera after queue completion | Wait for the owner that draws. **moved** |
| Grass readiness, visible captures | Three geometry counters; explicit isolation could skip grass wait | Bounded residency/progress wait and a subsequent completed frame consuming the final publication | Prevent incomplete grass frames; static review exposed the CPU/GPU race and a negative-control probe reproduces it. **moved** |
| Full close ownership/cutoff | Flat Three grass count/enabled fields | Nonempty layer records and base/ring visibility true | Current owner has two resident fields. **moved** |
| Full RTS ownership/cutoff | Same retired fields | Current nonempty layers and base/ring visibility true | Preserve blade presence. **moved** |
| Full top-down ownership/cutoff | Same retired fields, enabled false | Resident records retained; base/ring visibility false | Preserve distance cutoff independently of resident memory. **moved** |
| Dirt-edge RG8 resource | Three groundDetail path | TypeGPU terrain earth-edge stats; unchanged one-resource/no-vista assertion | Follow actual resource owner. **moved** |
| Road-edge RG8 resource | Same retired path | Same existing assertion through current owner | Preserve resource contract. **moved** |
| Road-scree RG8 resource | Same retired path | Same existing assertion through current owner | Preserve resource contract. **moved** |
| Edge-ruler RG8 resource | Same retired path | Same existing assertion through current owner | Preserve resource contract. **moved** |
| Pan return | Fixed400ms sleeps and optional retired hook | Wait for each completed clamped camera; exact return remains | An absent hook must not masquerade as settling. **moved** |
| full-close snapshot | Historical camera/renderer; default tolerance | Nearest production endpoint, current image, exact0/0 | Resolves foreground blades; independently repeated. **moved** |
| full-rts snapshot | Historical renderer/camera; default tolerance | Current actual camera and exact0/0 | Pin current full composition. **moved** |
| full-topdown snapshot | Historical image; default tolerance | Current image and exact0/0 | Preserve cutoff with an honest exact gate. **moved** |
| ground-only-close snapshot | Historical isolated image; default tolerance | Current substrate, exact0/0 | Preserve isolation control. **moved** |
| ground-only-rts snapshot | Historical isolated image; default tolerance | Current substrate, exact0/0 | Preserve isolation control. **moved** |
| ground-only-topdown snapshot | Historical isolated image; default tolerance | Current substrate, exact0/0 | Preserve isolation control. **moved** |
| dirt-edge snapshot | Earlier grass/camera; default tolerance | Completed current grass, exact0/0 | Preserve edge material proof after intentional grass-scale change. **moved** |
| road-edge snapshot | Earlier grass/camera; default tolerance | Completed current grass, exact0/0 | Same current consumer. **moved** |
| road-scree-rts snapshot | Earlier material/camera; default tolerance | Current edge composition, exact0/0 | Pins removal of old outline and current material. **moved** |
| edge-ruler snapshot | Earlier image; default tolerance | Current isolated ground/ruler, exact0/0 | Keep measured edge-width context. **moved** |
| Unknown edge-profile probe | Could execute no cases and succeed | Throws before browser creation | Avoid silent zero-coverage runs. **moved** |

All six cold-boot equalities, three ground-only exclusions/finite-telemetry checks,
and four1–2m edge-width/no-island assertions retain their contract. No production
shader, geometry, placement policy, simulation or test floor changed in this pass.
