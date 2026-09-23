# Current battle water consumer audit

This is diagnostic evidence, not visual acceptance. Native Chrome/Apple Metal,
production build, generated seed7, golden-hour and overcast-foggy, frozen tick60.
The corrected scene uses the installed water elevation, completed camera frame,
and a detached copy of the running battle’s tint mask. It no longer imports a
source-only WASM path or regenerates a separate map.

Both environments install one lake draw with3762 triangles, no ocean, and no
browser errors. The golden-hour mask hits0.378 against the unchanged0.42 minimum;
overcast hits0.571. Dry leakage is0.034 and0.112 respectively against0.12.
The old329×192 snapshots differ from the corrected375×265 projected crops.
They have not been updated. Native captures are not canonical software baselines.

The full golden frame shows dense bright, directional glints over most of the
lake. Its surface reads metallic and choppy rather than calm. This is standalone
water, unlike the lab field-water fixture that disables lake geometry. Extraction
preserves its previous WGSL exactly; a before/after production control is still
needed for the upcoming appearance change. Lowering a classification threshold
would not solve the visible surface problem.

The independent scene review found no actionable defects in current camera,
height scaling, live tint projection, or mask thresholds. Web typecheck and scene
syntax pass. Remaining work: improve standalone surface response, inspect both
environments and motion, then migrate/repeat justified software snapshots.
