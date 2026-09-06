import { animationForFrame } from "@packages/crowd-runtime/src/animationState";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { type LabContext, animateSkinned, createConfiguredShell, createSkinnedPipeline, publish } from "../labShell";

export async function route(ctx: LabContext) {
  const shell = await createConfiguredShell(ctx.canvas, {
    x: 0,
    y: 0,
    zoom: 13,
    pitch: 0.2,
    yaw: 0,
  });
  const markers = generatedFormation(12, { frame: 1 }).map((instance, i) => ({
    ...instance,
    x: (i - 5.5) * 2.4,
    y: i % 2 ? 1.4 : -1.4,
    facing: Math.PI / 2,
    faction: (i % 2) as 0 | 1,
  }));
  const pipeline = await createSkinnedPipeline(shell);
  animateSkinned(shell, pipeline, () => markers, { size: 1.3 });
  const rows = Array.from({ length: 12 }, (_, frame) => {
    const state = animationForFrame(frame, 240, frame * 19, frame !== 4);
    return `<tr><td>${frame}</td><td>${state.clip}</td><td>${state.phase.toFixed(3)}</td><td>${state.loop}</td></tr>`;
  }).join("");
  ctx.status.innerHTML = `<table><tr><th>frame</th><th>clip</th><th>phase</th><th>loop</th></tr>${rows}</table>`;
  publish("animation-state", true, { frames: 12 });
}
