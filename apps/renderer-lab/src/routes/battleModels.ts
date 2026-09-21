import { BattlePreview, startBattlePreviewLoop } from "../battlePreview";
import {
  DEFAULT_MODEL_POSE,
  modelCamera,
  modelInstances,
  type BattleModelPose,
} from "../battleModelFixture";
import { type LabContext, el } from "../labShell";
import { BattleModelReplay } from "../battleModelReplay";

/** A review fixture, not a second renderer: terrain, shadows, pose sampling and post are production-owned. */
export async function route(ctx: LabContext): Promise<void> {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const world = await BattlePreview.create(ctx.canvas, {
    soldierCatalogUrl: ctx.params.get("catalog") ?? undefined,
    gameplay: false,
  });
  try {
    const pose = { ...DEFAULT_MODEL_POSE };
    if (!world.soldierAssets[pose.classId])
      pose.classId = Number(Object.keys(world.soldierAssets)[0]);
    const initialClips = world.soldierAssets[pose.classId].animation.clips;
    if (!initialClips.some((clip) => clip.name === pose.clip)) pose.clip = initialClips[0].name;
    const size = 32;
    await world.setTerrain({
      w: size,
      h: size,
      cell: 4,
      ox: -64,
      oy: -64,
      tint: new Uint8Array(size * size),
      height: new Float32Array(size * size),
    });
    // Isolated asset review removes foliage occlusion, not ground, lighting or shadows.
    world.setGrassVisible(false);
    world.setReviewVisibility({ scenery: false });
    const controls = el("div", "model-controls");
    controls.innerHTML = `
    <h2>Battle models</h2>
    <p>Production renderer · current baked assets</p>
    <label>Appearance <select id="model-class"></select></label>
    <label>Clip <select id="model-clip"></select></label>
    <label>Phase <output id="model-phase-value"></output><input id="model-phase" type="range" min="0" max="1" step="0.01" value="0"></label>
    <label>Bearing <output id="model-yaw-value"></output><input id="model-yaw" type="range" min="-3.14159" max="3.14159" step="0.01" value="0.45"></label>
    <label>Tilt <output id="model-pitch-value"></output><input id="model-pitch" type="range" min="0.1" max="1.5" step="0.01" value="1.15"></label>
    <label>Scale <output id="model-zoom-value"></output><input id="model-zoom" type="range" min="15" max="260" step="1" value="190"></label>
    <label><input id="model-formation" type="checkbox"> 4 × 4 formation</label>
    <label><input id="model-alive" type="checkbox"> Alive (manual clip)</label>
    <div><button id="model-play">Play clip</button><button id="model-turn">Turntable</button></div>
    <button id="model-reload">Reload local bake</button>
    <p>Import GLBs with the local appearance baker. Source errors are reported by that command.</p>
    <p id="model-load" role="status">Ready</p>
    <details id="model-replay-panel"><summary>Action replay</summary>
      <p>Synthetic inputs · real controller.<br>Local poses blended on GPU.<br>Base and masked rider action.</p>
      <p id="model-replay-availability"></p>
      <button id="model-replay-play">Play replay</button><button id="model-replay-reset">Reset replay</button>
      <label>Tick (0–240) <output id="model-replay-tick">0</output><input id="model-replay-seek" type="range" min="0" max="240" step="1" value="0"></label>
      <label>Jump to event <select id="model-replay-jump"></select></label>
      <p id="model-replay-events"></p><div id="model-replay-state"></div>
      <a id="model-review-matrix" href="/assets/soldiers/review-matrix.json" target="_blank">Generated applicability matrix</a>
    </details>`;
    ctx.panel.prepend(controls);
    ctx.status.id = "model-submitted-status";
    const style = document.createElement("style");
    style.textContent = `
    .model-controls { color: #e8d7b0; border: 2px solid #755931; padding: 12px; background: linear-gradient(#30271b,#211a12); box-shadow: inset 0 1px #a58b59; }
    .model-controls h2 { font: 20px Georgia,serif; margin: 0 0 8px; }
    .model-controls p { font-size: 12px; line-height: 1.5; }
    .model-controls label { display: block; margin: 13px 0; font-size: 13px; }
    .model-controls select, .model-controls input[type=range] { display: block; width: 100%; margin-top: 5px; }
    .model-controls select, .model-controls button { color: #efdfb8; background: #33291c; border: 1px solid #8c7047; padding: 6px; }
    .model-controls button { margin: 4px 5px 4px 0; cursor: pointer; }
    .model-controls output { float: right; font-variant-numeric: tabular-nums; }
    .model-controls input { accent-color: #bf944e; }
    .model-controls summary { cursor: pointer; }
    #model-replay-panel { padding-bottom: 24px; }
    #model-replay-panel p { font-size: 14px; }
    #model-replay-panel button { padding: 8px 12px; }
    #model-replay-state p { white-space: pre-line; border-top: 1px solid #755931; padding-top: 7px; margin: 8px 0; overflow-wrap: anywhere; }
    #model-replay-state strong { display: block; color: #efdfb8; }
    #model-replay-events { font-weight: bold; white-space: pre-line; }
    .model-controls a { color: #efdfb8; }
  `;
    document.head.append(style);
    const control = <T extends HTMLElement>(id: string) =>
      controls.querySelector<T>(`#model-${id}`)!;
    control("replay-panel").hidden = !ctx.params.has("replay");
    const populate = () => {
      control<HTMLSelectElement>("class").replaceChildren(
        ...Object.entries(world.soldierAssets).map(
          ([id, bundle]) => new Option(`${id} · ${bundle.manifest.name}`, id),
        ),
      );
      control<HTMLSelectElement>("clip").replaceChildren(
        ...world.soldierAssets[pose.classId].animation.clips.map(
          ({ name }) => new Option(name, name),
        ),
      );
    };
    populate();
    let playing = false;
    let turning = false;
    let dirty = true;
    let revision = 0;
    let frame = 0;
    let reloads = 0;
    let error: string | null = null;
    let last = performance.now();
    let staticAppearance = "";
    let replay: BattleModelReplay | null = null;
    let replayPlaying = false;
    const replayAvailable = () => !!world.soldierAssets[pose.classId]?.manifest.presentation;
    const syncReplay = () => {
      control("replay-availability").textContent = replayAvailable()
        ? "Replay the selected appearance"
        : "Manual-only asset · clip inspection remains available";
      for (const id of ["replay-play", "replay-reset", "replay-seek", "replay-jump"])
        (control(id) as HTMLButtonElement).disabled = !replayAvailable();
      control("review-matrix").hidden = ctx.params.has("catalog");
      control("replay-play").textContent = replayPlaying ? "Pause replay" : "Play replay";
      if (!replay) {
        control("replay-tick").textContent = "0";
        control<HTMLInputElement>("replay-seek").value = "0";
        control("replay-events").textContent = "";
        control("replay-state").textContent = "";
        control("replay-jump").replaceChildren(new Option("Start with Play or Reset", "0"));
        return;
      }
      const state = replay.state();
      control("replay-tick").textContent = Number(state.tick.toFixed(1)).toString();
      control<HTMLInputElement>("replay-seek").value = String(state.tick);
      const event = replay.events.filter((event) => event.tick <= state.tick).at(-1)!;
      control<HTMLSelectElement>("replay-jump").replaceChildren(
        ...replay.events.map(
          (event) => new Option(`${event.tick}: ${event.label}`, String(event.tick)),
        ),
      );
      control<HTMLSelectElement>("replay-jump").value = String(event.tick);
      control("replay-events").textContent =
        `Now: ${event.label}\nNext: ${replay.events.find((event) => event.tick > state.tick)?.label ?? "End"}`;
      const { base, riderUpperBody: upper } = state.playback;
      const source = (value: typeof base.source) =>
        value.kind === "frozen"
          ? "frozen local pose"
          : `${value.sample.clip} · phase ${value.sample.phase.toFixed(3)}`;
      const submitted = world.debugSoldierAnim(0);
      control("replay-state").replaceChildren(
        ...[
          [
            `Base · appearance ${state.playback.appearanceId}`,
            `From: ${source(base.source)}\nTo: ${base.destination.clip} · phase ${base.destination.phase.toFixed(3)}\nBlend weight: ${base.weight.toFixed(2)}`,
          ],
          [
            "Rider upper body",
            upper
              ? `From: ${source(upper.source)}\nTo: ${"kind" in upper.destination ? "evaluated base" : `${upper.destination.clip} · phase ${upper.destination.phase.toFixed(3)}`}\nBlend weight: ${upper.weight.toFixed(2)}`
              : "None",
          ],
          [
            "Submitted base destination",
            submitted ? `${submitted.clip} · phase ${submitted.phase.toFixed(3)}` : "Pending",
          ],
        ].map(([label, value]) => {
          const row = document.createElement("p"),
            title = document.createElement("strong");
          title.textContent = label;
          row.append(title, document.createTextNode(value));
          return row;
        }),
      );
    };
    const sync = () => {
      control<HTMLSelectElement>("class").value = String(pose.classId);
      control<HTMLSelectElement>("clip").value = pose.clip;
      for (const key of ["phase", "yaw", "pitch", "zoom"] as const) {
        control<HTMLInputElement>(key).value = String(pose[key]);
        control(key + "-value").textContent = pose[key].toFixed(2);
      }
      control<HTMLInputElement>("formation").checked = pose.formation;
      control<HTMLInputElement>("alive").checked = pose.alive;
      syncReplay();
    };
    const set = (change: Partial<BattleModelPose>) => {
      const next = { ...pose, ...change };
      if (
        ![next.phase, next.yaw, next.pitch, next.zoom, ...next.target].every(Number.isFinite) ||
        next.target.length !== 3 ||
        next.zoom <= 0 ||
        next.phase < 0 ||
        next.phase > 1
      )
        throw new Error("Invalid model pose");
      modelInstances(next, world.soldierAssets);
      Object.assign(pose, next);
      if (
        change.classId !== undefined ||
        change.clip !== undefined ||
        change.phase !== undefined ||
        change.alive !== undefined ||
        change.formation !== undefined
      ) {
        replay = null;
        replayPlaying = false;
      }
      populate();
      sync();
      dirty = true;
      revision++;
    };
    let reloading = false;
    let drawComplete: Promise<void> = Promise.resolve();
    const reload = async () => {
      if (reloading) return { ok: false, error: "Reload already in progress" };
      reloading = true;
      await drawComplete;
      control<HTMLButtonElement>("reload").disabled = true;
      control("load").textContent = "Loading local bake…";
      try {
        await world.reloadSoldierAssets(pose);
        if (replay)
          replay = world.soldierAssets[replay.appearanceId]?.manifest.presentation
            ? new BattleModelReplay(world.soldierAssets, replay.appearanceId)
            : null;
        replayPlaying = false;
        populate();
        sync();
        reloads++;
        error = null;
        control("load").textContent = "Local bake reloaded";
      } catch (cause) {
        error = String(cause);
        control("load").textContent = error;
      } finally {
        reloading = false;
        control<HTMLButtonElement>("reload").disabled = false;
        dirty = true;
        revision++;
      }
      return { ok: error === null, error };
    };
    control<HTMLSelectElement>("class").onchange = (event) => {
      const classId = Number((event.target as HTMLSelectElement).value);
      const clips = world.soldierAssets[classId].animation.clips;
      const clip = clips.some((clip) => clip.name === pose.clip) ? pose.clip : clips[0].name;
      set({ classId, clip, phase: clip === pose.clip ? pose.phase : 0 });
    };
    control<HTMLSelectElement>("clip").onchange = (event) =>
      set({ clip: (event.target as HTMLSelectElement).value, phase: 0 });
    for (const key of ["phase", "yaw", "pitch", "zoom"] as const) {
      control<HTMLInputElement>(key).oninput = (event) =>
        set({ [key]: Number((event.target as HTMLInputElement).value) });
    }
    control<HTMLInputElement>("formation").onchange = (event) => {
      const formation = (event.target as HTMLInputElement).checked;
      set({ formation, zoom: formation ? 65 : DEFAULT_MODEL_POSE.zoom });
    };
    control<HTMLInputElement>("alive").onchange = (event) =>
      set({ alive: (event.target as HTMLInputElement).checked });
    control("play").onclick = () => {
      replay = null;
      replayPlaying = false;
      playing = !playing;
      control("play").textContent = playing ? "Pause clip" : "Play clip";
    };
    control("turn").onclick = () => {
      turning = !turning;
      control("turn").textContent = turning ? "Stop turntable" : "Turntable";
    };
    control("reload").onclick = () => {
      void reload();
    };
    const startReplay = () => {
      playing = false;
      turning = false;
      replayPlaying = false;
      control("play").textContent = "Play clip";
      control("turn").textContent = "Turntable";
      replay = new BattleModelReplay(world.soldierAssets, pose.classId);
      control("replay-panel").hidden = false;
      dirty = true;
      revision++;
      syncReplay();
    };
    control("replay-play").onclick = () => {
      if (!replay) startReplay();
      replayPlaying = !replayPlaying;
      syncReplay();
    };
    control("replay-reset").onclick = () => {
      if (!replay) startReplay();
      replay!.reset();
      replayPlaying = false;
      dirty = true;
      revision++;
      syncReplay();
    };
    control<HTMLInputElement>("replay-seek").oninput = (event) => {
      if (!replay) startReplay();
      replay!.seek(Number((event.target as HTMLInputElement).value));
      replayPlaying = false;
      dirty = true;
      revision++;
      syncReplay();
    };
    control<HTMLSelectElement>("replay-jump").onchange = (event) => {
      if (!replay) startReplay();
      replay!.seek(Number((event.target as HTMLSelectElement).value));
      replayPlaying = false;
      dirty = true;
      revision++;
      syncReplay();
    };
    let needsResize = true;
    const observer = new ResizeObserver(() => {
      needsResize = true;
      dirty = true;
      revision++;
    });
    observer.observe(ctx.canvas);
    const stats = () => ({
      pose: { ...pose },
      catalog: world.soldierCatalogUrl,
      frame,
      reloads,
      error,
      playing,
      turning,
      pendingDraw:
        dirty ||
        needsResize ||
        reloading ||
        ctx.canvas.width !== Math.max(1, Math.round(ctx.canvas.clientWidth)) ||
        ctx.canvas.height !== Math.max(1, Math.round(ctx.canvas.clientHeight)),
      render: world.stats(),
      sampled: world.debugSoldierAnim(0),
      replay: replay ? { ...replay.state(), playing: replayPlaying, events: replay.events } : null,
    });
    const browserWindow = window as unknown as {
      __rendererLabReady: boolean;
      __rendererLabStats: unknown;
      __battleModels: {
        set: typeof set;
        reload: typeof reload;
        stats: typeof stats;
        freeze: () => void;
        world: BattlePreview;
        replay: { start: typeof startReplay; seek: (tick: number) => void; reset: () => void };
      };
    };
    browserWindow.__battleModels = {
      set,
      reload,
      stats,
      world,
      replay: {
        start: startReplay,
        seek: (tick) => {
          if (!replay) startReplay();
          replay!.seek(tick);
          replayPlaying = false;
          dirty = true;
          revision++;
          syncReplay();
        },
        reset: () => {
          if (!replay) startReplay();
          replay!.reset();
          replayPlaying = false;
          dirty = true;
          revision++;
          syncReplay();
        },
      },
      freeze: () => {
        playing = false;
        turning = false;
        replayPlaying = false;
        dirty = true;
        revision++;
        control("play").textContent = "Play clip";
        control("turn").textContent = "Turntable";
      },
    };
    sync();
    const draw = async (now: number) => {
      if (reloading) return;
      if (needsResize) {
        needsResize = false;
        await world.resize(ctx.canvas.clientWidth, ctx.canvas.clientHeight, 1);
      }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const advancing = playing || turning || replayPlaying;
      if (replay && replayPlaying) {
        replay.seek(Math.min(replay.endTick, replay.state().tick + dt * 30));
        if (replay.state().tick === replay.endTick) replayPlaying = false;
      }
      if (playing) {
        const animation = world.soldierAssets[pose.classId].animation;
        const clip = animation.clips.find((clip) => clip.name === pose.clip)!;
        pose.phase = clip.duration > 0 ? pose.phase + dt / clip.duration : 0;
        if (clip.duration <= 0 || (!clip.loop && pose.phase >= 1)) {
          if (clip.duration > 0) pose.phase = 1;
          playing = false;
          control("play").textContent = "Play clip";
        } else if (clip.loop) pose.phase %= 1;
      }
      if (turning) pose.yaw = ((pose.yaw + dt * 0.3 + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dirty || advancing || frame < 3) {
        const submittedRevision = revision;
        const instances = replay
          ? replay.state().instances
          : modelInstances(pose, world.soldierAssets);
        const appearanceId = instances[0].classId;
        const appearance = `${appearanceId}:${instances.length}`;
        if (staticAppearance !== appearance) {
          world.setStatic(new Uint32Array(instances.length), [0], [appearanceId]);
          staticAppearance = appearance;
        }
        world.setTime(0);
        await world.drawInstances(
          instances,
          modelCamera(pose, ctx.canvas.width, ctx.canvas.height),
        );
        await world.render();
        frame++;
        dirty = revision !== submittedRevision;
        sync();
        ctx.status.textContent = `${instances.length} soldier${instances.length === 1 ? "" : "s"} · ${instances[0].clip} ${instances[0].phase.toFixed(3)} · ${world.stats().environment}`;
        browserWindow.__rendererLabStats = { ok: true, route: "battle-models", stats: stats() };
        browserWindow.__rendererLabReady = true;
      }
    };
    startBattlePreviewLoop(
      world,
      (now) => (drawComplete = draw(now)),
      (failure) => {
        error = failure instanceof Error ? failure.message : String(failure);
        ctx.status.textContent = error;
        browserWindow.__rendererLabReady = true;
        browserWindow.__rendererLabStats = { ok: false, route: "battle-models", error };
      },
      () => observer.disconnect(),
    );
  } catch (error) {
    world.dispose();
    throw error;
  }
}
