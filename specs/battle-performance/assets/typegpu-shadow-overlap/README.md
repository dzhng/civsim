# High cascade receiver numerical check

Integrated worker3d922bb7 and root runner correction348cc72d as8241e245 and
0a157745. Main combined candidate77/77 and candidate-test typecheck pass.

The real TypeGPU receiver samples synthetic constant-depth layers at14 receiver
positions across4 configurations. On Apple Metal, all56 baseline samples pass:
max error0.0000012517 against the predeclared tolerance0.0001155914. Both layer-swap
and receiver-swap mutations fail numerically with clean GPU validation and no page
errors. No existing source comparison or visual threshold changed.

Root and independent review both found the original mutation runner accepted any
failed report, including validation failures/nonfinite readbacks. The corrected
runner requires complete finite data, no validation errors, and an actual numeric
mismatch before accepting an expected failure. Actual GPU invalid-buffer injection
proves the old predicate would accept and the new runner exits1; scoped MAP_READ
NaN injection independently does the same. The first NaN probe modified a different
mapping and left numerical readbacks finite; it is retained as ineffective, not
counted as a successful falsifier.

This is a receiver binding/overlap/fade gate. Constant layers deliberately eliminate
caster geometry and PCF variation; this does not prove caster fit, moving-shadow
stability, readability, image parity, FPS or net-shadow savings. The implementation
is mostly verification code: explicit probe construction/independent closed-form
oracle and CPU tests, with a small float-texture readback addition to the existing
lab owner. It introduces no production frame work or rendering policy.
