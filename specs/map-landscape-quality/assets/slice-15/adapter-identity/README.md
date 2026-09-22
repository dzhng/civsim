# Native adapter identity

With the existing hardware flags, native Chrome reports apple/metal-3 and
isFallbackAdapter=false. The bundled browser reports google/swiftshader with
isFallbackAdapter=true. Hardware flags alone therefore do not select native
hardware on this machine; record browser channel as well as adapter identity.

The full-game scene passes menu, battle, campaign and handoff liveness on native
Chrome/Metal. Its own classification remains headless-liveness-only, not hardware
release acceptance. Do not promote that report to a timing-budget pass. Headful
measurement and an archived comparable baseline remain required by the existing
performance reporter.

The corrected turf scene also completed its functional checks on Chrome/Metal:
close/full and ground-only cold-boot repeats, camera identity, blade presence and
cutoff, complete residency, edge widths and camera return. Eight older image
baselines differ. This is runtime/hardware-adapter evidence, not a SwiftShader
baseline migration or final turf appearance acceptance.
