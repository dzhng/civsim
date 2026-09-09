# Capture environment diagnostic

The merged heavy-front comparison reported 67,935 changed pixels (maximum
channel difference 26), concentrated in floor shadow stipple. The merged
invocation omitted `VERIFY_GPU=1`, so the scene runner did not select its
SwiftShader flags. Repeating with that flag matched the committed image at
zero changed pixels. No renderer fix, baseline update, or tolerance change was
needed. The integrating agent separately completed all three model scenes:
twelve snapshots matched at zero pixels before adding the guard.

The guard now fails before page creation when the GPU flag is absent or the
hardware override is selected. Both real runner invocations returned exit 1
with actionable environment errors for all three scenes. Configured Vitest
tests cover rejected and accepted runner configurations (two tests passed).
A correct-flag guarded heavy-front capture again matched at zero pixels;
that cross-worktree run later stopped at Vite's unrelated `/@fs/` allowlist,
so it is not claimed as a full guarded scene pass.

Independent review caught an undiscovered test extension (migrated to the
configured Vitest TypeScript suite) and the old universal hardware-regeneration
instruction (replaced with adapter-specific selection guidance). The guard
does not change the global runner's defaults or silently skip a verification.

## Change ledger

The workbench, Blender production candidate, and far-bundle scenes previously
attempted pixel comparisons under any launch environment. They now reject
missing SwiftShader launch flags or a hardware override before capture, because
their zero-tolerance images are adapter-specific. Existing image and behavior
assertions are unchanged. The new unit tests pin that precondition only.
