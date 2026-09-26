# Implementation choices

## Sound — medium confidence

### Measure relative CPU work in hardware-backed headless Chrome

When comparing camera implementations, Chrome runs without a visible window
and verifies that it uses the Apple Metal adapter. This measures browser CPU
work and animation-callback intervals. It cannot tell us when a physical display
presents a frame or how long an input takes to become visible.

The original plan prescribed the existing hidden-browser hardware runner while
also grouping headless results with software rendering. That contradiction was
resolved before admission: record display mode and adapter separately, retain
all numeric thresholds, and limit the resulting claims. Future performance
reports must preserve that distinction. A physical presentation benchmark
requires a separate measurement surface. Sound because the claims match what
the tool measures; medium confidence because the plan left the display-mode
choice inconsistent. Made during measurement preparation.

### Preserve current appearance while keeping historical snapshot failures visible

Before the camera edit, five canonical images already disagreed with current
rendering. The optimization must leave the game looking the same, so matched
current captures supply a strict before/after comparison. Existing canonical
baselines and thresholds remain untouched, and their failures remain disclosed.
Updating their artwork references would make this CPU task decide which
historical visual changes should become the new standard.

The plan did not anticipate those failures. Future visual maintenance still
owns their resolution and the existing label/shadow issues found during review.
This decision establishes preservation of current behavior, not approval of
all current visuals or a claim that every canonical snapshot passes. Sound
because it isolates the requested behavior-preserving change; medium confidence
because it changes how an initially red visual gate is assessed. Made before
the production camera edit.

## Sound — high confidence

### Make the existing transform write into caller-owned storage

A camera may project thousands of points before its pose changes. Each query
supplies a reusable four-number vector to the existing matrix transform, which
reads the input coordinates before writing the answer. The same vector can
therefore serve as input and output without corrupting later calculations.
Public campaign results still get independent storage when they escape to a
caller, so keeping one result never lets a later query change it.

The plan required reuse and shared arithmetic but did not specify this
low-level signature. Giving the existing transform a required output argument
keeps the formula in one owner; all its callers move together. Future callers
must supply output storage and honor its lifetime. Sound because both cold and
prepared camera paths share the primitive, with aliasing exercised by actual
prepared queries. Made during campaign integration.
