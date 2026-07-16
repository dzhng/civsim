# Slice 04 visual gate — ACCEPT

Date: 2026-07-16. Adapter: SwiftShader WebGPU for deterministic shots; Apple/Metal for
the hardware performance gate.

## Mechanism verdict

The primary box-filtered vertex-coverage attempt was **KILLED**. Its scalar probe passed,
but close frames exposed 4/8 m facets and a dark categorical-tint halo. The slice's
pre-declared escalation is now active: one terrain-load RG8 signed-distance texture stores
the mud-or-road union in R and classified road in G. The playable ground is its only owner;
vista sampling is zero. Legacy stride-10 bytes remain pinned at hash `8e8938da`.

The accepted shader composes unpremixed meadow, mud, and road albedo with weights that sum
to one. One shared world-space edge noise perturbs both channels. Mud churn uses only the
unwarped mud interior; the feather and all road pixels are excluded. Mud and classified
road tints are neutralized only in the photoreal tint copy so interpolated categorical tint
cannot manufacture forest/scree rings. Scree remains tint 6 and keeps its hard treatment.

## Measured gate

- Mud 10–90% width: **1.747 m**.
- Road left/right 10–90% widths: **1.431 m / 1.142 m**.
- Declared displacement bound: **2.5 m**; detached islands: **0**.
- Resource: one **RG8-unorm 320×240** fixture texture, linear/linear, no vista samples.
- Empty masks are finite `-32 m`; asymmetric orientation, padded boundaries, packed bytes,
  island ownership, and the mud↔road union seam are unit-pinned.

## Visual verdict

Authoritative shots:

- `ground-turf/dirt-edge.png`: close mud seam, grass included.
- `ground-turf/road-edge.png`: close road seam, grass included.
- `ground-turf/road-scree-rts.png`: wide road+scree ownership control.
- `ground-turf/edge-ruler.png`: 10 m bar with 1 m ticks crossing the mud seam.

Fresh unprimed critique returned **ACCEPT** on all three acceptance frames: no grid
staircase, halo, detached islands, or churn leak on mud/road; the wide frame proves that
road does not inherit the intentionally hard scree boundary. The reference comparison is
edge-character only: the candidate keeps the reference's bitten, encroached transition
without copying its photographic tufts or brown palette. Slice-03 open meadow ownership is
unchanged; only frames containing mud/road boundaries are eligible to move.

Comparison artifacts:

- `slice04-visual-comparison/dirt-reference-vs-candidate.png`
- `slice04-visual-comparison/meadow-vs-edge-control.png`

## Performance and isolation

The 30k Apple/Metal gate passed: median GPU **25.13 ms mid / 24.77 ms vista**, both below
33 ms. The bake runs only on terrain load; the render path adds one texture resource and no
draw call, upload/readback loop, or camera rebuild. Campaign and Rust/sim files are
untouched. Rough/speed are copied read-only from their existing wasm pointers.

The non-blocking Preview checkpoint opened all four authoritative PNGs together in macOS
Preview; the evidence was sufficient to accept and continue.
