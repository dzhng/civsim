# Fitted shadow depth boundary

The moving-camera probe exposed a triangular dark wedge across empty terrain.
It remained with all casters disabled. Pinned Three’s PCF shadow path checks the
upper depth bound but omits the lower one: with reversed depth, a receiver beyond
the fitted map compares below its cleared depth and is falsely shadowed.

Candidate `c34e6fe9` changes the default single-map adapter: it now applies the missing lower bound through the
public filter hook, retaining the pinned PCF kernel. The existing CSM path is
unchanged. The narrowed hook type reflects the installed object-shaped API;
the dependency’s published types still describe its old positional signature.

The numerical browser scene `system/shadow-depth-range.mjs` renders a receiver
beyond an empty map’s depth range in both depth conventions. [Before](before.log),
reversed depth produced black instead of the unshadowed value 164. [After](after.log),
both remain 164, with no warnings. The fixture rebuilds projection on distinct
browser frames after Three initializes the shadow camera’s depth convention;
otherwise it would falsely pass without exercising negative shadow depth.
Twenty-one focused shadow tests and web typechecking pass. Independent code
review found no remaining issue; its sandbox prevented an independent GPU run,
so the hardware result here is root’s execution.

The production route was recaptured through the same 270-step camera path.
[Pixel changes](pixel-diff.json), the [before crop](before-crop.png),
[after crop](after-crop.png) and [full frame](after-full.png) show the rendered
change. A fresh visual review confirms the wedge’s removal in both affected
samples, retained attached unit shadows and unchanged formation readability.
Orderly row-shadow bands, fine grass speckling and distant haze remain. Selected
stills do not establish continuous temporal stability, flicker or frame rate.

No prior test threshold or baseline was relaxed. The new GPU regression adds an
empty-map/out-of-range contract that previous geometric fit tests did not cover.
This is a correctness fix in the isolated shadow candidate, not final acceptance
of shadow cost or the completed performance feature.
