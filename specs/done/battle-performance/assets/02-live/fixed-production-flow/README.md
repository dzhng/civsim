# Fixed production Menu flow controls

All four production builds pass the unchanged `battle-benchmark-flow` scene through `web/scene.mjs` on hardware Chrome: preparation advances real ticks without redrawing skipped history, manual controls cannot disturb preparation, cancellation invents no FPS, partial export stays honest, return to Menu succeeds, and no page errors occur. Each retained report contains all seven checks.

Build source is `9d377399db7c74c57793cff0aae14bbdc6603319`. The parent independently verified every emitted file against the manifest, then copied only emitted build outputs into an isolated control directory, preserving shared asset symlinks. Source code and outputs stayed fixed throughout each browser run. Servers and browser runs were serialized and closed after each check. The build manifest records the sparse-worktree asset links and verifies their content against the source commit; these links do not represent changed asset content.

These are shared-host functional checks of compiled startup/cancellation, not full five-minute recordings, quiet trials, visual acceptance, instrumentation-overhead evidence or backend rankings. The source bundle includes its pinned timestamp readback tap. Native bundles use their own observer; absence of the source tap does not make them uninstrumented overhead controls. Source and native interval aggregation are present in the emitted code, with static proof retained separately.

The prior sparse build failure is retained in the build worktree under `throwaway/fixed-menu-builds/attempt-1-failed`; missing build-only soldier assets were supplied through read-only links and verified against the commit. No shader, quality, simulation or performance threshold changed in this pass.
