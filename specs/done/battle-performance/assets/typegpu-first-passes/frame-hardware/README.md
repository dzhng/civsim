# TypeGPU frame lifecycle on hardware

Adapted the existing raw frame lifecycle fixture to the actual TypeGPU frame,
using public unwrap for the diagnostic triangle. Both1x and4x preserve exact
HDR pixels after failed resize, successful resize versus a fresh frame, and
post bypass. Camera identity is stable and same-size resize adds no observed
synchronous pipeline creation. Depth stats report191x129 depth32float, reversed
clear0, and98556/394224 requested bytes. No browser/GPU errors or warnings.

The first adapter read a guarded camera getter after disposal and failed. Moving
that identity observation before disposal fixes the probe, not product code.
The next run retained two buffers/176 bytes after frame disposal; explicit
environment disposal releases both. Tracking begins after environment creation,
but TypeGPU lazily materializes those resources during later work. The final
zero-resource assertion therefore covers frame plus borrowed environment teardown,
not frame-owned resources alone. All tracked textures were already released.
Original failing observations remain here; no threshold was weakened.

This verifies frame lifecycle/diagnostics at the fixture, not full battle depth
composition, consumer stats wiring, visual quality or performance. The transform
and runner are scratch reproduction evidence; production code was not altered.
