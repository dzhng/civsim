import { PhotorealBattleWorld } from "@packages/photoreal-renderer/src/battle/battleWorld";
import {
  DEFAULT_MODEL_POSE,
  modelCamera,
  modelInstances,
  type BattleModelPose,
} from "../battleModelFixture";
import { type LabContext, el } from "../labShell";

/** A review fixture, not a second renderer: terrain, shadows, pose sampling and post are production-owned. */
export async function route(ctx: LabContext): Promise<void> {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const world = await PhotorealBattleWorld.create(ctx.canvas, {
    soldierCatalogUrl: ctx.params.get("catalog") ?? undefined,
    gameplay: false,
  });
  const pose = { ...DEFAULT_MODEL_POSE };
  if (!world.soldierAssets[pose.classId])
    pose.classId = Number(Object.keys(world.soldierAssets)[0]);
  const initialClips = world.soldierAssets[pose.classId].animation.clips;
  if (!initialClips.some((clip) => clip.name === pose.clip)) pose.clip = initialClips[0].name;
  const size = 32;
  world.setTerrain({
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
  world.world.scene.traverse((object) => {
    if (object.name.startsWith("battle-scenery-")) object.visible = false;
  });
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
    <div><button id="model-play">Play clip</button><button id="model-turn">Turntable</button></div>
    <button id="model-reload">Reload local bake</button>
    <p>Import GLBs with the local appearance baker. Source errors are reported by that command.</p>
    <p id="model-load" role="status">Ready</p>`;
  ctx.panel.prepend(controls);
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
  `;
  document.head.append(style);
  const control = <T extends HTMLElement>(id: string) => controls.querySelector<T>(`#model-${id}`)!;
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
  let frame = 0;
  let reloads = 0;
  let error: string | null = null;
  let last = performance.now();
  let staticAppearance = "";
  const sync = () => {
    control<HTMLSelectElement>("class").value = String(pose.classId);
    control<HTMLSelectElement>("clip").value = pose.clip;
    for (const key of ["phase", "yaw", "pitch", "zoom"] as const) {
      control<HTMLInputElement>(key).value = String(pose[key]);
      control(key + "-value").textContent = pose[key].toFixed(2);
    }
    control<HTMLInputElement>("formation").checked = pose.formation;
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
    populate();
    sync();
    dirty = true;
  };
  const reload = async () => {
    control<HTMLButtonElement>("reload").disabled = true;
    control("load").textContent = "Loading local bake…";
    try {
      await world.reloadSoldierAssets(pose);
      populate();
      sync();
      reloads++;
      error = null;
      control("load").textContent = "Local bake reloaded";
    } catch (cause) {
      error = String(cause);
      control("load").textContent = error;
    } finally {
      control<HTMLButtonElement>("reload").disabled = false;
      dirty = true;
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
  control("play").onclick = () => {
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
  const resize = () => {
    world.resize(ctx.canvas.clientWidth, ctx.canvas.clientHeight, 1);
    dirty = true;
  };
  new ResizeObserver(resize).observe(ctx.canvas);
  resize();
  const stats = () => ({
    pose: { ...pose },
    catalog: world.soldierCatalogUrl,
    frame,
    reloads,
    error,
    playing,
    turning,
    pendingDraw: dirty,
    render: world.stats(),
    sampled: world.debugSoldierAnim(0),
  });
  const browserWindow = window as unknown as {
    __rendererLabReady: boolean;
    __rendererLabStats: unknown;
    __battleModels: {
      set: typeof set;
      reload: typeof reload;
      stats: typeof stats;
      freeze: () => void;
      world: PhotorealBattleWorld;
    };
  };
  browserWindow.__battleModels = {
    set,
    reload,
    stats,
    world,
    freeze: () => {
      playing = false;
      turning = false;
      dirty = true;
      control("play").textContent = "Play clip";
      control("turn").textContent = "Turntable";
    },
  };
  sync();
  const draw = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const advancing = playing || turning;
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
      const instances = modelInstances(pose, world.soldierAssets);
      const appearance = `${pose.classId}:${instances.length}`;
      if (staticAppearance !== appearance) {
        world.setStatic(new Uint32Array(instances.length), [0], [pose.classId]);
        staticAppearance = appearance;
      }
      world.setTime(0);
      world.drawInstances(instances, modelCamera(pose, ctx.canvas.width, ctx.canvas.height));
      world.render();
      frame++;
      dirty = false;
      sync();
      ctx.status.textContent = `${instances.length} soldier${instances.length === 1 ? "" : "s"} · ${pose.clip} ${pose.phase.toFixed(3)} · ${world.stats().environment}`;
      browserWindow.__rendererLabStats = { ok: true, route: "battle-models", stats: stats() };
      browserWindow.__rendererLabReady = true;
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
