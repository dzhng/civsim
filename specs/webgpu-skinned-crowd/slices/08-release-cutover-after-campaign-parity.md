# Release Cutover After Campaign Parity

## Contract

The release audit can only turn green after campaign parity and improvement are
accepted. Plumbing that exists today is not proof: visual evidence, named
hardware performance, and cutover status must agree.

## Human Check

Run the campaign scenes, then the full WebGPU scenario bundle, then release
audit. The lab cutover route must not claim visual improvement or hardware
performance complete unless the script-generated audit has the evidence.

## Verification

- `npm run scenario:webgpu:campaign`
- `npm run scenario:webgpu`
- `npm run cutover:webgpu`
- `npm run release:webgpu`
- Named-hardware performance report with current-renderer baseline context.

## Done

- [ ] Campaign visual acceptance is complete.
- [ ] Real hardware performance is equal or better, or has an explicit release
  exception.
- [ ] `release:webgpu` passes.
- [ ] Old current-renderer screenshot generation is no longer part of routine work;
  archived captures remain only as historical release evidence.
