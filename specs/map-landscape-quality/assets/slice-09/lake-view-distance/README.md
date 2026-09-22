# Standalone lake detail follows viewing distance

Accepted only for excessive distant glints. The lake shader formerly faded its
normal detail with XY distance from camera focus. A lake centered in an aerial
view therefore kept close-range detail. It now uses world-space eye distance;
the existing120–420m fade range and all wave, color, roughness and geometry inputs
remain unchanged. Ocean attenuation is unchanged.

Compare with [production controls](../battle-consumer-audit/README.md). Native
Chrome/Metal, seed7, frozen tick60, matched camera and environments. Golden water
hit rises0.378→0.437 against the unchanged0.42 floor, overcast0.571→0.563; dry
leak remains0.034/0.112. Both exact crop repeats differ by0 pixels. The corrected
production scene and opt-in live tint diagnostic used for this evidence remain
an uncommitted verification migration; old software baselines are not accepted
by these native captures.

Fresh unprimed review prefers the candidate in both environments: fewer foil-like
highlights at landscape distance. Regular diagonal ripples and the cyan shoreline
outline remain unresolved; no motion acceptance is claimed. Independent code
review and Codex review found no actionable issue with coordinates, units, or
scope. Web typecheck and focused field-water tests pass.
