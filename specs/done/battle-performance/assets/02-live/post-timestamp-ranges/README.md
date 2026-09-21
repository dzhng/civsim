# Overlapping GPU pass timestamps

All three fixed-HDR controls pass the unchanged numerical gate and both timing
modes at2880×1800. Ordered raw timestamp ranges prove that multiple native post
passes overlap on this Apple metal-3 adapter. With bloom enabled, mean pass sums
are9.21–12.03ms, while the corresponding observed first-begin/last-end spans and
interval unions are1.73–1.82ms. These are24-sample diagnostic runs, not repeated
backend performance trials. The whole-game pass sums must not be interpreted as
elapsed GPU time or compared across batching strategies as GPU work.

The raw begin/end values are preserved as decimal nanosecond strings. A union
counts overlapping observed intervals once; a span includes any gaps between the
first begin and final end. Neither is a physical GPU-busy or presentation-latency
measurement. The exact interval semantics and comparable source coverage must be
resolved before the matched report can use them as an acceptance metric.

No blur-coefficient or image change was made. The earlier local-array hypothesis
is unproven and no longer the immediate next optimization: the measurement issue
comes first. All numerical controls remain unchanged.

The first TypeGPU attempt completed numerical/timing work but the driver rejected
an HTTP404 resource error. Its report remains here. The diagnostic page now has
an inline empty favicon and the driver records failed request URLs; all three
subsequent runs report no resource errors. The original error lacked a URL, so its
precise cause is not established. The production diagnostic build was held fixed
through the three successful runs, with exclusive task GPU ownership.

This is consistent with stage-based timestamp boundaries, not evidence of invalid
query writes. [Dawn's Metal implementation](https://dawn.googlesource.com/dawn/+/refs/heads/chromium/7862/src/dawn/native/metal/CommandBufferMTL.mm)
maps render beginnings to vertex-stage starts and endings to fragment-stage ends.
[Apple's execution model](https://developer.apple.com/videos/play/wwdc2020/10632/)
documents overlap between later vertices and earlier fragments, including across
frames. Neither observed intervals nor queue submission boundaries prove exclusive
GPU busy time. Preserve the [WebGPU timestamp limitations](https://gpuweb.github.io/gpuweb/#timestamp)
when interpreting the corrected metrics.
