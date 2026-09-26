# Implementation choices

## Sound — medium confidence

### Use hardware-backed headless Chrome for relative CPU comparisons

When comparing two camera implementations, the probe launches Chrome without a
visible window and verifies that the application uses the Apple Metal adapter.
This measures actual browser CPU work and animation-callback intervals while
avoiding unsolicited live browser windows. It does not measure when a display
physically presents a frame or the delay from input to visible response.

The plan accidentally grouped all headless results with software rendering,
while prescribing the existing headless hardware runner. Those are different
properties: a hidden browser can use the real GPU. The implementation resolves
that contradiction by recording both display mode and adapter identity, allowing
relative CPU comparisons on verified hardware, and retaining the ban on FPS or
physical latency claims from these measurements. Software rendering remains a
correctness-only surface. All numeric admission thresholds stay unchanged.

This choice constrains future reports: they must name browser display mode and
adapter and must not promote callback timing into a hardware presentation claim.
It is sound because it matches the actual measurement surface; a visible-window
release benchmark would be a separate task. Made during slice 1 before admission.
