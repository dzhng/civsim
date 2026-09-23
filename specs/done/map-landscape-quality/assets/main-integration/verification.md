# Main integration verification

Integrated `origin/main` at `fa2e11bf` into landscape checkpoint `99a97b52`.

- Rebuilt release WASM from the merged Rust sources.
- TypeScript check and production build passed.
- Full frontend suite: 179 files, 1,060 tests passed.
- Independent scoped Codex review found no actionable merge regressions in world lifetime/composition, campaign crowd sharing, or signed-shore transfer and geometry.
- SwiftShader campaign-handoff passed all checks: campaign presentation, encounter launch, generated TypeGPU battle, seating of all 16,000 soldiers (maximum delta 0), visible faction pixels, return to the same campaign and no page errors.

These checks establish integration behavior, not reference-quality visual acceptance or hardware performance. The new battle material still needs the landscape adoption work recorded in the spec. Pending road-width changes were held separately during these checks.
