# Complete-scene assembly contract

[Raw WebGPU is selected](backend-decision.md). The complete candidates and Menu
routes already exist; [migration.md](migration.md) promotes the selected owners
and closes real feature gaps. Component, replay, held and live evidence retain
different meanings. Do not rebuild completed layers or rank an incomplete route.

## Assembly contract

The live presentation order starts with ActionTimeline interpolation and unit readouts, then seated crowd upload and camera preparation; tactical-line submission closes the frame. A native owner must consume those presented inputs rather than rereading raw simulation arrays. Main and shadow audiences share visibility policy but retain distinct hysteresis histories. Mesh uploads that return impostor selections still require real per-appearance impostor draws.

Preserve separate opaque and transparent ordering: background and terrain underlays precede opaque world content; transparent far fog follows opaque soldiers. Readouts are opaque cutouts and precede the transparent list even though their renderOrder is high. Ground cues, effects and attack triangles retain their source depth/order contracts. Attack triangles are live combat content despite their internal debug name. Aerial distance uses the source observer at camera focus XY and zero elevation. CSS height controls readout sizing; physical framebuffer height controls LOD and grass.

Initialization owns asset/pipeline admission and first presentation; live frames must not settle grass or wait for queue completion each time. Resize replaces framebuffer attachments without invalidating borrowed camera layouts. Settings, terrain replacement, pending asynchronous uploads, cancellation and disposal need explicit ownership before live timing. Component owners are reusable evidence, not a second simulation or a permanent backend switch.

In recorded-command replay, each draw owns its crowd upload and pose compute. A render-only command refreshes billboard view metadata without advancing LOD history or recomputing poses. Grass update starts at draw; resolved publication is consumed at preparation for presentation. Keeping these boundaries distinct allows the same coordinator to replay multiple updates before a render and camera-only renders between simulation ticks.

## Live asynchronous presentation

The integrated frame coordinator awaits ordered presentation before recording completion and excludes overlapping frame mutation. Preserve that boundary when promoting the selected world. A promise queued behind a synchronous facade is not a completed presentation and must not inflate the benchmark's submission count. Preserve each ActionTimeline input and include elapsed preparation in frame latency, while recording asynchronous wait separately from CPU work. GPU queue-completion fences remain capture/readiness tools, not a per-frame scheduling policy. Scene exit must prevent an awaiting frame from touching released simulation state or HUD.

## GPU attribution

[The range control](assets/02-live/post-timestamp-ranges/README.md) proves that
overlap inflates native pass sums. Completed held reports use correlated interval
unions, retaining missing-query counts. Never optimize blur coefficients or rank
backends from summed overlapping ranges. [Native await attribution](assets/02-native-await-profile/README.md)
also shows CPU work inside async metrics; those metrics are not pure GPU waiting
and do not justify removing admission boundaries.
