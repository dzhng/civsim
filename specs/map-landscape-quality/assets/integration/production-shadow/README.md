# Production adapter and shadow integration

The adapter at `ff2f6c4f` preserves its explicit frame preparation. Rendering calls
`setFrameCamera`, fits the shared sun to that camera, then submits standards and
crowd. The frame used for cards and picking remains the presented frame.

All519 web tests and typecheck pass on the merged tree. GPU smoke and final
production comparison remain pending the atmospheric-ray fix; the separate
adapter and shadow evidence does not substitute for this merged gate.
