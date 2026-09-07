import {
  ActionTimeline,
  ACTION_TICK_SECONDS,
  type ActionObservation,
} from "@packages/crowd-runtime/src/actionTimeline";
import { buildCrowdInstances } from "@packages/crowd-runtime/src/instanceData";
import { APPEARANCE_DESCRIPTORS } from "@packages/soldier-assets/src/appearance";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";

/** Lab observations only; action selection and pose composition remain timeline-owned. */
export interface BattleModelReplayRecipe {
  endTick: number;
  events: { tick: number; label: string }[];
  /** Pure synthetic observation at the requested tick; seeking may call it repeatedly. */
  observation(tick: number): ActionObservation;
}

/** Repeated observed emissions stress both full-body and mounted upper-body lanes.
 * This accepts presented release assets, including lab diagnostics; it is not art admission.
 */
export function denseBattleModelReplayRecipe(
  bundle: AppearanceBundle,
  appearanceId: number,
): BattleModelReplayRecipe {
  const presentation = bundle.manifest.presentation;
  const release = bundle.animation.clips.find(
    (clip) => clip.name === presentation?.actions.release?.clip,
  );
  const death = bundle.animation.clips.find(
    (clip) => clip.name === presentation?.actions.death?.clip,
  );
  if (!release || release.markers?.release === undefined || !death)
    throw new Error("Dense replay requires presented release and death clips");
  // Derive the observation when release finishes from authored timing, not a second sampler.
  const exitTick =
    18 + Math.ceil((release.duration * (1 - release.markers.release)) / ACTION_TICK_SECONDS);
  const reentryTick = exitTick + 8;
  const deathTick = reentryTick + 3;
  const endTick = deathTick + Math.ceil(death.duration / ACTION_TICK_SECONDS) + 10;
  const releases = [10, 11, 14, 15, 18, reentryTick];
  return {
    endTick,
    events: [
      { tick: 0, label: "Ready" },
      { tick: 1, label: "Walk" },
      { tick: 4, label: "Run" },
      ...releases.slice(0, -1).map((tick) => ({ tick, label: "Release observed" })),
      { tick: exitTick - 1, label: "Walk during release" },
      { tick: exitTick, label: "Release exit" },
      { tick: exitTick + 1, label: "Run during exit" },
      { tick: exitTick + 5, label: "Exit converged" },
      { tick: reentryTick, label: "Release reentry" },
      { tick: deathTick, label: "Composed death" },
      { tick: endTick, label: "Terminal hold" },
    ],
    observation(tick) {
      const releaseTick = [...releases].reverse().find((event) => event <= tick);
      const releaseAgeSeconds =
        releaseTick === undefined ? 0 : (tick - releaseTick) * ACTION_TICK_SECONDS;
      return {
        appearanceId,
        alive: tick < deathTick,
        health: 100,
        mountHealth: 100,
        speedMps: tick < 1 ? 0 : 1,
        forwardMps: tick < 1 ? 0 : 1,
        routing: false,
        incapacitated: false,
        guardedFacing: false,
        lateralMps: 0,
        running: tick >= 4 && (tick < exitTick - 1 || tick >= exitTick + 1),
        atEase: false,
        pikeReady: false,
        fighting: false,
        releaseTtl: releaseTick === undefined ? 0 : Math.max(0, 0.5 - releaseAgeSeconds),
        releaseAgeSeconds,
      };
    },
  };
}

/** Synthetic observation replay: action selection is real; these are not captured combat events. */
export class BattleModelReplay {
  readonly endTick: number;
  readonly events: BattleModelReplayRecipe["events"];
  private readonly timeline: ActionTimeline;
  private tick = 0;
  private observedTick = -1;
  private readonly equipmentId: number;
  private latestObservation!: ActionObservation;

  constructor(
    private readonly assets: Record<number, AppearanceBundle>,
    readonly appearanceId: number,
    private readonly recipe?: BattleModelReplayRecipe,
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
    this.endTick = recipe?.endTick ?? 240;
    this.events = recipe?.events ?? [
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
      this.latestObservation = this.observation(next);
      this.timeline.update(next, [this.latestObservation]);
      this.observedTick = next;
    }
    this.tick = tick;
    return this.state();
  }

  state() {
    return this.buildState(this.observation(this.tick));
  }

  private buildState(observation: ActionObservation) {
    const playback = this.timeline.sample(this.tick);
    const { instances } = buildCrowdInstances({
      positions: new Float32Array([0, 0]),
      playback,
      alive: new Uint8Array([Number(observation.alive)]),
      mountedClasses: Object.entries(this.assets)
        .filter(([, bundle]) => bundle.manifest.mounted)
        .map(([id]) => Number(id)),
    });
    return {
      tick: this.tick,
      observation,
      playback: playback[0],
      instances,
      snapshotBytes: this.timeline.snapshotBytes,
    };
  }

  /** Rebuild if necessary; never observe the boundary before its first sample. */
  seekBoundary(tick: number) {
    if (!Number.isInteger(tick) || tick <= 0 || tick > this.endTick)
      throw new Error(
        "Replay boundary requires an observed predecessor and an integer tick in range",
      );
    this.seek(tick - 1);
    this.tick = tick;
    const before = this.buildState(this.latestObservation);
    const after = this.seek(tick);
    return { before, after };
  }

  private observation(tick: number): ActionObservation {
    if (this.recipe) return this.recipe.observation(tick);
    const appearanceId = tick >= 165 ? this.equipmentId : this.appearanceId;
    const releaseTick = tick >= 90 ? 90 : tick >= 60 ? 60 : null;
    const releaseAgeSeconds = releaseTick === null ? 0 : (tick - releaseTick) / 30;
    return {
      appearanceId,
      alive: tick < 195,
      health: tick < 105 ? 100 : 80,
      mountHealth: 100,
      speedMps: tick < 15 ? 0 : 1,
      forwardMps: tick < 15 ? 0 : 1,
      routing: false,
      incapacitated: false,
      guardedFacing: false,
      lateralMps: 0,
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
