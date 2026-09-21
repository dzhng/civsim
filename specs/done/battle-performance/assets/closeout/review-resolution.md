# Final review resolution

The first scoped TypeGPU ownership review found no actionable issues. A separate
whole-feature static review found two P2 issues; both were confirmed and fixed.

- **Effective benchmark graphics:** the loop recorded stored preferences although
  the renderer applied URL overrides. It now uses the same resolveGraphicsSettings
  policy. The actual `/benchmark?shadows=off&bloom=off` run reached the measured
  phase and recorded both overrides, with the installed shadow owner reporting off.
  This metadata correction does not change the default full-window workload/result.
- **Delayed selected-unit drag:** when a worker pick resolved after the last mouse
  movement, the input callback cleared the box without calculating displacement.
  One shared drag update now consumes the retained pointer on movement and on pick
  completion. The reproduced red case passes without an extra mousemove; stale
  generations and aborts also leave newer/disposed input untouched. Thirteen input
  tests pass, including exact drag-order arguments.

Preview review also fixed dirty-update/resize/reload races. The final material
pixel failures came from comparing a 970×758 old framebuffer with a 1280×800 resized
one. Pending-draw diagnostics include resize and size mismatch; the consumer waits
before taking its reference image. Failed reload and equivalent material reindex
retain exact pixels.

Visual reviews distinguish historical baseline changes from current-source
regressions. Matched current-source forest and heavy-model controls have the same
canopy/contact-shadow limitations. The tactical user framing has readable default
shadows. No continuous-motion perfection or full elimination of frame spikes is
claimed.
