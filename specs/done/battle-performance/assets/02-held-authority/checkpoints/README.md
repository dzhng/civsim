# Coherent tour checkpoints — complete

All eight actual Menu tours and both offline consistency comparisons pass. These
runs observe completed-frame registrations and deep-copy six tour points. They
are explicitly inadmissible as timing evidence. Immutable8643cf05 builds, held
authority, framebuffer and quality settings match the completed comparison.

Every sampled stats camera equals the same frame's consumed camera in its Menu
export; approximate tour offsets stay within50ms. Raw and TypeGPU match all
reported counts/histograms at all twelve checkpoints. All four backends match
soldier counts and main/shadow visibility at every checkpoint. Differences:

- Tick9000,15/60seconds: raw/TypeGPU retain88 more l0 shadow casters and88 fewer
  l3 casters than Three/vgpu. Visible-tier histograms agree everywhere.
- Tick12000,15/60seconds: vgpu has88 fewer l0 and88 more l3 shadow casters than
  Three/raw/TypeGPU. At240seconds vgpu has two additional visible l2 bodies and
  two fewer l3 bodies; the total visible audience is unchanged. Other histograms
  agree. Approximate poses and LOD histories are not exact work parity.

[Projection progress](../../07-projection-progress/README.md) records proven
near-plane/hysteresis defects, now corrected in source, and unresolved attribution
of the exact88 identities in these original builds. Fixes do not rewrite the
historical evidence. No missing soldiers are established by these observations;
no full-motion visual or live-performance acceptance follows from them.

The per-tick manifests hash decompressed checkpoint, Menu, scenario and comparison
reports; all gzip round-trips were checked against originals. The later directory
also retains the eight-case outcome record. Originals and per-case logs remain
under throwaway/held-fixed/checkpoints. The driver ended normally after all cases;
there is no pending preview or checkpoint process to resume.
