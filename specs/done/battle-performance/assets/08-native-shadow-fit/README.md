# Native fitted shadow resource controls

Raw WebGPU, TypeGPU and vgpu use the same stateful shadow fit as Three. One
native packer owns reverse-Z matrices, fitted normal bias, and separate crowd
caster depth. Resource adapters own GPU buffers and skip writes when the fit
revision is unchanged. The shared sampling function rejects post-bias depth
outside the map, matching the production depth guard.

Each backend's report and paired PNGs come from the hardware shadow control
with `?backend=<name>&fitted`. The original unposed control remains available.
All three fitted controls pass their existing projection, nonempty shadow,
repeatability and image-difference gates with no browser/GPU errors. These are
isolated grayscale caster/receiver controls, not complete battle or performance
acceptance. CPU tests also compare actual Three matrices and crowd frustum
planes across four environments, a zoom sequence, and terrain replacement;
unchanged fits perform no repeated native upload.

Scene integration is still in progress. Camera-only presentation can change
visibility after the last crowd upload; both source and native scenes must
refresh the audience from owned submitted state before a changed map is drawn.
Do not rank complete scenes until that contract and the remaining common
scheduling/grass work are matched.

Independent visual review inspected all twelve pairs and found no visible
placement, shape or softness mismatch. Fine boundary stippling is shared.
Local and whole-map shadows extend past the right image edge in both images,
so those captures cannot judge the full right endpoint. Independent code review
found no concrete packing/lifecycle defect; it excluded unfinished scene wiring.
All 22 focused shadow tests and raw, vgpu, TypeGPU and web typechecks pass.
