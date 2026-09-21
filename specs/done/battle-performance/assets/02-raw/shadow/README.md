# Existing directional shadow control

The native depth owner and shared WGSL projection/filter reproduce the existing
single directional shadow contract. A hidden box casts onto a visible plane;
source output is the actual Three shadow node, isolated from material lighting.
The source and native runtime own their respective depth passes and resources.
Double-sided caster geometry removes side selection as a variable in this primitive
control; real crowd/scenery caster audiences remain an integration gate.

Four cases cover a local fit, its identical repeat, a horizon camera and the current
whole-map fit. Both outputs contain visible shadow pixels, identical repeats are
exact, and all values are finite. Maximum HDR difference is 0.001465; shadow
view-projection matrices differ by less than 1e-8. No GPU or browser errors occurred.
The orthographic CPU tests also check physical clip bounds and source matrices at
battle scale. A separate source review found no actionable issue in this primitive
pass; it did not claim to run the GPU control independently.

[Fresh visual review](../frame-ports/review/findings.md) found matching masks and
edge falloff. Local masks differ at seven display pixels and whole-map at 45, all
by one code value; the horizon pair is identical. Shared penumbra stippling and the
blurrier whole-map result are retained. The final shared-function extraction and
nonempty/repeat checks reproduce those reviewed images byte for byte.

This is existing shadow fidelity, not stronger default shadows, complete soldier
shadow integration, motion stability or performance evidence. The world owns caster
selection and camera bind groups; the shadow owner lends its depth, camera and
sampling state without owning the borrowed device. One shared policy supplies fit,
normal bias, depth bias and radius; the filter follows pinned Three r185's five-tap
Vogel PCF and physical-pixel noise.

Run the shadow Vite config, then the common frame verifier with
`FRAME_CHECK_URL=http://localhost:5200/shadow-check.html`. The config avoids copying
public assets. PNGs and the unmodified report beside this document are the gate
artifacts.
