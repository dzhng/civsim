import { ActionTimeline, type ActionObservation } from "@packages/crowd-runtime/src/actionTimeline";
import { buildCrowdInstances } from "@packages/crowd-runtime/src/instanceData";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";

/** Synthetic observation replay: action selection is real; these are not captured combat events. */
export class BattleModelReplay {
  readonly endTick = 240;
  readonly events: { tick: number; label: string }[];
  private readonly timeline: ActionTimeline;
  private tick = 0;
  private observedTick = -1;
  private readonly equipmentId: number;

  constructor(
    private readonly assets: Record<number, AppearanceBundle>,
    readonly appearanceId: number,
  ) {
    const bundle = assets[appearanceId];
    if (!bundle?.manifest.presentation)
      throw new Error("Manual-only appearance: action replay unavailable");
    this.timeline = new ActionTimeline(assets);
    const descriptor = APPEARANCE_DESCRIPTORS[appearanceId];
    const selection = descriptor?.name === bundle.manifest.name ? descriptor.selection : undefined;
    const alternate = APPEARANCE_DESCRIPTORS.findIndex(
      (descriptor) =>
        descriptor.selection.unitClass === selection?.unitClass &&
        descriptor.selection.state === "sidearm",
    );
    this.equipmentId =
      alternate >= 0 && assets[alternate]?.manifest.presentation ? alternate : appearanceId;
    this.events = [
      { tick: 0, label: "Ready" },
      { tick: 15, label: "Walk" },
      { tick: 30, label: "Run" },
      {
        tick: 45,
        label: bundle.manifest.presentation.actions.melee ? "Melee effort" : "Melee unavailable",
      },
      {
        tick: 60,
        label: bundle.manifest.presentation.actions.release
          ? "Release observed"
          : "Release unavailable",
      },
      {
        tick: 90,
        label: bundle.manifest.presentation.actions.release
          ? "Repeated release"
          : "Continue effort",
      },
      { tick: 105, label: "Health decreased" },
      { tick: 150, label: "Recover / walk" },
      {
        tick: 165,
        label: this.equipmentId !== appearanceId ? "Sidearm appearance" : "Equipment unchanged",
      },
      { tick: 195, label: "Death" },
      { tick: 240, label: "Terminal hold" },
    ];
    this.seek(0);
  }

  reset() {
    this.timeline.reset();
    this.observedTick = -1;
    return this.seek(0);
  }

  seek(tick: number) {
    if (!Number.isFinite(tick) || tick < 0 || tick > this.endTick)
      throw new Error("Replay tick is outside its range");
    if (tick < this.tick) {
      this.timeline.reset();
      this.observedTick = -1;
    }
    // Observe every intermediate tick so seeking cannot erase release/injury edges.
    for (let next = this.observedTick + 1; next <= Math.floor(tick); next++) {
      this.timeline.update(next, [this.observation(next)]);
      this.observedTick = next;
    }
    this.tick = tick;
    return this.state();
  }

  state() {
    const observation = this.observation(this.tick);
    const playback = this.timeline.sample(this.tick);
    const { instances } = buildCrowdInstances({
      positions: new Float32Array([0, 0]),
      playback,
      alive: new Uint8Array([Number(observation.alive)]),
      mountedClasses: Object.entries(this.assets)
        .filter(([, bundle]) => bundle.manifest.mounted)
        .map(([id]) => Number(id)),
    });
    return { tick: this.tick, observation, playback: playback[0], instances };
  }

  private observation(tick: number): ActionObservation {
    const appearanceId = tick >= 165 ? this.equipmentId : this.appearanceId;
    const releaseTick = tick >= 90 ? 90 : tick >= 60 ? 60 : null;
    const releaseAgeSeconds = releaseTick === null ? 0 : (tick - releaseTick) / 30;
    return {
      appearanceId,
      alive: tick < 195,
      health: tick < 105 ? 100 : 80,
      mountHealth: 100,
      speedMps: tick < 15 ? 0 : 1,
      running: tick >= 30 && tick < 150,
      atEase: false,
      pikeReady: false,
      fighting: tick >= 45 && tick < 105,
      releaseTtl:
        releaseTick !== null && this.assets[appearanceId].manifest.presentation!.actions.release
          ? Math.max(0, 0.5 - releaseAgeSeconds)
          : 0,
      releaseAgeSeconds,
    };
  }
}
