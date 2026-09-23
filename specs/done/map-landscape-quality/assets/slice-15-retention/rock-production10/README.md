# Rock bitmap retirement in production

All125 checks pass over ten campaign/battle cycles, retaining the original
terrain, worker, renderer and screen-UI lifetime checks. Each world decodes one
rock image; terrain updates reuse it. Every retired rock texture is disposed
once, every decoded bitmap is closed once, and both are collected. The active
campaign resource remains live. A forced campaign constructor failure after
decode also releases and collects its texture and bitmap. No resource-retention
exception was added; the pre-existing latest-battle-renderer exception remains.

Ten built JS/WASM/image/HTML artifacts remained byte-identical. React Refresh
is absent and no page errors occurred. Hardware Chrome was requested; this
run does not independently record its adapter identity. The separate battle
material capture observes Apple/Metal, which must not substitute for this run.

User-agent memory spans295,537,918–305,709,772 bytes and ends298,495,960.
Renderer counters remain33 geometries and182 textures; program counts are
unavailable. This measures bounded retirement for this build, not GPU frame
time or all failure paths. Battle constructor failure and decode failure are
not covered by the injected campaign constructor failure.

The retained adapter adds instrumentation to the previous screen-UI production
scene; it owns no runtime code. Its records use weak references and scalars.
The initial attempt encountered a stopped preview server before entering the
scene; the verified run uses the restarted production preview on5220.
