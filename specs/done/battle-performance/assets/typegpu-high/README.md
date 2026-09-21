# TypeGPU High shadow capability

Integrated at109b17bc from887506b0. Independent review of93f56ccf found no actionable
defects; the final amendment removes type erasure from camera groups, inspected
by root. Shared colour/frame and shadow changes combine with42 passing candidate
tests and a passing candidate test typecheck. Existing live-test unknown-stats
type error reproduces on baseline and is not waived as a new pass.

Root fixed-build hardware Menu controls pass single/High/off, at1440x900DPR2,
with camera changes, resize and zero tracked allocations after disposal. No page
errors or warnings. High owns two2048 layers/32MiB; single one1024 layer/4MiB;
off no shadow depth. The unchanged single-map comparison against Three also passes.
This is real receiver shader execution and resource wiring, not a proof of High
split/fade correctness, stable motion or performance. A dedicated overlap/depth
readback oracle remains needed; the existing control intentionally stays single.

Independent still-image critique sees subtle grounding in High, stronger repeated
dark bands in single, and flatter figures with shadows off. It found no obvious
missing geometry or major discontinuity at this scale. Poses differ across the
captures, so this is not a matched-state contrast measurement. Still images cannot
prove shimmer, popping, camera smoothness or timing; HUD FPS is not evidence.

The first build attempt refused a changed commit before compilation; the worker
had amended away an unnecessary generic type annotation. The recorded successful
build pins887506b0. Recovery from an accidental unrelated stash application remains
in main throwaway/typegpu-high-recovery; all stray files are excluded from this
commit and their original stash is untouched.
