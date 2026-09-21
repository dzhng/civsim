# GPU impostor derivation: candidate contract

The [consultation](consultation.txt) supports moving camera-derived billboard
calculations into the existing vertex shader. It is a proposal, not verified
performance evidence. The [slice](../../README.md)
owns adoption requirements. Implementation runs separately from main; no
candidate code is adopted here.

Review disposition:

- Accept compact state plus camera/atlas data and a retained direction table.
  Mesh buffers do not contain every far soldier, so they cannot substitute for
  the full impostor input. The consultation's resource table omits the direction
  buffer; implementation must own and dispose it with the layer.
- Keep live state uploads on every submission. A paused-state cache would not
  address continuous interpolation and animation in the requested workload.
- Reject the claim that adjacent atlas tiles are necessarily visually equivalent.
  Floating-point near ties require measurement; they do not waive image gates.
  A continuous size formula also does not prove pixel equivalence.
- Reject an absolute prohibition on increased GPU time. This is CPU-to-GPU
  offloading: end-to-end savings, cadence, GPU headroom and the net-shadow
  requirement decide acceptance.
- The previous crowd ownership candidate failed its declared screen; it was not
  simply undecidable. Its control CPU medians varied about 1.2% wide and 4.7%
  moving. That limited sample does not establish a noise-free benchmark.

Review scope is the plan and consultation only: one layer owns state and view,
no extra normal-frame pass/readback, and the real comparison consumers retain the
CPU oracle. No tests or production behavior change in this checkpoint.
