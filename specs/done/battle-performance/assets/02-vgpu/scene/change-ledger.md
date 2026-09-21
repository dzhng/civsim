# Verification changes

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| Existing crowd/lifecycle lab tests | Seventeen shared cases passed | Unchanged assertions remain green | Preserve publication history and asynchronous cleanup policy |
| Vgpu frame lifecycle | No resize or post bypass | Five CPU cases cover stable camera, same-size no-op, failed constructor/resize, deferred disposal and ordered bypass rendering | Compose the actual scene without replacing component camera bindings |
| Vgpu terrain lifecycle | No combined terrain resource owner | Two CPU cases cover retained staging failure, complete replacement and late-resource cleanup | Ground, vista, water, scenery and backdrop share one committed generation |
| Vgpu scene ordering | No complete coordinator | Four CPU cases cover per-draw pose work, camera-only prepare, layer order, upload gating and dependent terrain failure | Match the source command stream before GPU comparison |
| Staged cleanup guard | Stopping after a throwing disposer left one resource live | Original and staged resources are released; original error retained | Reviewer finding reproduced, negative log preserved |

No image tolerance or renderer-selection gate changed. These tests use controlled resource seams and are not GPU verification.
