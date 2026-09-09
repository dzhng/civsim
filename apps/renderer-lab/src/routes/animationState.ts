import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import {
  type LabContext,
  animateSkinned,
  createConfiguredShell,
  createSkinnedPipeline,
  publish,
} from "../labShell";

export async function route(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 13,
    pitch: 0.2,
    yaw: 0,
  });
  const clips = ["idle", "march", "run", "at_ease", "attack_a", "death_a", "hit_a", "shoot"];
  const markers = generatedFormation(clips.length, { clip: "idle" }).map((instance, i) => ({
    ...instance,
    x: (i - (clips.length - 1) / 2) * 2.4,
    clip: clips[i],
    phase: 0,
    alive: clips[i] !== "death_a",
    y: i % 2 ? 1.4 : -1.4,
    facing: Math.PI / 2,
    faction: (i % 2) as 0 | 1,
  }));
  const pipeline = await createSkinnedPipeline(shell);
  animateSkinned(shell, pipeline, () => markers, { size: 1.3 });
  const rows = markers
    .map((pose) => `<tr><td>${pose.clip}</td><td>${pose.phase.toFixed(3)}</td></tr>`)
    .join("");
  ctx.status.innerHTML = `<table><tr><th>explicit clip</th><th>phase</th></tr>${rows}</table>`;
  publish("animation-state", true, { poses: markers.length });
}
