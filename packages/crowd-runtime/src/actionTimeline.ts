import type { AppearancePresentation, ActionRole } from "../../soldier-assets/src/presentation";
import type { LocalAnimationClip } from "../../soldier-assets/src/localAnimation";
import { marchingStateForSpeed } from "./animationState";
import type { ImportedRig } from "../../soldier-assets/src/rig";
import {
  sampleRigLocalPose,
  blendLocalPoses,
  composeMaskedLocals,
  type LocalPose,
} from "../../soldier-assets/src/localPose";

export interface ActionObservation {
  appearanceId: number;
  alive: boolean;
  health: number;
  mountHealth: number;
  speedMps: number;
  running: boolean;
  atEase: boolean;
  /** The current weapon supports a held pike pose, not proof of physical bracing. */
  pikeReady: boolean;
  fighting: boolean;
  /** Seconds remaining after an already emitted projectile. */
  releaseTtl: number;
  /** Elapsed seconds since emission, derived from the simulation-owned TTL duration. */
  releaseAgeSeconds: number;
}

export interface ClipSample {
  clip: string;
  phase: number;
}
export type PoseSource =
  | { kind: "clip"; sample: ClipSample }
  | { readonly kind: "frozen"; readonly locals: readonly number[] };
export interface ClipBlend {
  source: PoseSource;
  destination: ClipSample;
  weight: number;
}
export interface RiderBlend {
  source: PoseSource;
  destination: ClipSample | { kind: "base" };
  weight: number;
}
export interface SoldierPlayback {
  appearanceId: number;
  base: ClipBlend;
  riderUpperBody?: RiderBlend;
}
type ActionClip = Pick<LocalAnimationClip, "name" | "duration" | "loop" | "markers">;
type PlaybackAppearance = {
  manifest: { presentation: AppearancePresentation | null };
  animation: { clips: readonly ActionClip[] };
  rig: ImportedRig;
};
export function evaluatePlaybackPose(
  appearance: PlaybackAppearance,
  playback: SoldierPlayback,
): LocalPose {
  const pose = (sample: ClipSample) =>
    sampleRigLocalPose(appearance.rig, sample.clip, sample.phase);
  const source = (value: PoseSource) =>
    value.kind === "frozen" ? Float64Array.from(value.locals) : pose(value.sample);
  const base = blendLocalPoses(
    source(playback.base.source),
    pose(playback.base.destination),
    playback.base.weight,
  );
  if (!playback.riderUpperBody) return base;
  const mask = appearance.manifest.presentation!.riderUpperBodyJoints!.map((name) =>
    appearance.rig.bones.findIndex((bone) => bone.name === name),
  );
  const upper = playback.riderUpperBody;
  const destination = "kind" in upper.destination ? base : pose(upper.destination);
  return composeMaskedLocals(
    base,
    blendLocalPoses(source(upper.source), destination, upper.weight),
    mask,
  );
}
interface Track {
  role: ActionRole;
  clip: ActionClip;
  started: number;
  startPhase: number;
}
interface Lane {
  current: Track;
  source: PoseSource;
  changed: number;
}
interface History {
  appearanceId: number;
  moving: boolean;
  base: Lane;
  overlay?: Lane;
  overlayExiting?: boolean;
  health: number;
  mountHealth: number;
  releaseTtl: number;
}

const BLEND_SECONDS = 0.15;
export const ACTION_TICK_SECONDS = 1 / 30;
function sample(track: Track, seconds: number): ClipSample {
  const progress =
    track.clip.duration > 0
      ? track.startPhase + Math.max(0, seconds - track.started) / track.clip.duration
      : 0;
  return { clip: track.clip.name, phase: track.clip.loop ? progress % 1 : Math.min(1, progress) };
}
function blend(lane: Lane, seconds: number): ClipBlend {
  const destination = sample(lane.current, seconds);
  const weight = Math.min(1, Math.max(0, seconds - lane.changed) / BLEND_SECONDS);
  return {
    source: weight === 1 ? { kind: "clip", sample: destination } : lane.source,
    destination,
    weight,
  };
}
function playback(history: History, seconds: number): SoldierPlayback {
  const result: SoldierPlayback = {
    appearanceId: history.appearanceId,
    base: blend(history.base, seconds),
  };
  if (history.overlay) {
    const upper = blend(history.overlay, seconds);
    result.riderUpperBody = {
      ...upper,
      destination: history.overlayExiting ? { kind: "base" } : upper.destination,
    };
  }
  return result;
}
function transition(
  lane: Lane | undefined,
  current: Track,
  seconds: number,
  freeze: () => LocalPose,
  restart = false,
): Lane {
  if (!lane)
    return {
      current,
      source: { kind: "clip", sample: sample(current, seconds) },
      changed: -Infinity,
    };
  if (lane.current.role === current.role && !restart) return lane;
  return {
    current,
    source: Object.freeze({ kind: "frozen", locals: Object.freeze(Array.from(freeze())) }),
    changed: seconds,
  };
}

/** Render-only histories follow observed simulation time; no wall clock or combat writes. */
export class ActionTimeline {
  private histories: History[] = [];
  private tick = -Infinity;
  constructor(private appearances: Readonly<Record<number, PlaybackAppearance>>) {}

  reset(): void {
    this.histories = [];
    this.tick = -Infinity;
  }

  /** Numeric payload bytes, excluding array/object overhead and consumer-held samples. */
  get snapshotBytes(): number {
    let bytes = 0;
    for (const history of this.histories) {
      for (const lane of [history.base, history.overlay])
        if (lane?.source.kind === "frozen") bytes += lane.source.locals.length * 8;
    }
    return bytes;
  }

  sample(tick = this.tick): SoldierPlayback[] {
    if (this.histories.length === 0) return [];
    if (!Number.isFinite(tick) || tick < this.tick)
      throw new Error("cannot sample before the latest observation or at invalid time");
    return this.histories.map((history) => playback(history, tick * ACTION_TICK_SECONDS));
  }

  update(tick: number, observations: readonly ActionObservation[]): SoldierPlayback[] {
    if (!Number.isFinite(tick)) throw new Error("action timeline requires finite simulation time");
    const resetting = tick < this.tick || observations.length < this.histories.length;
    const previousHistories = resetting ? [] : this.histories;
    const previousTick = resetting ? -Infinity : this.tick;
    const nextHistories: History[] = [];
    const seconds = tick * ACTION_TICK_SECONDS;
    const output = observations.map((observation, index) => {
      const prior = previousHistories[index];
      let history = prior && {
        ...prior,
        base: { ...prior.base },
        overlay: prior.overlay && { ...prior.overlay },
      };
      if (history && (tick === previousTick || history.base.current.role === "death")) {
        if (blend(history.base, seconds).weight === 1)
          history.base.source = blend(history.base, seconds).source;
        nextHistories[index] = history;
        return playback(history, seconds);
      }
      const presentation = this.appearances[observation.appearanceId]?.manifest.presentation;
      if (!presentation)
        throw new Error(`appearance ${observation.appearanceId} is manual-only or missing`);
      const moving = marchingStateForSpeed(observation.speedMps, history?.moving ?? false);
      const injured =
        !!history &&
        (observation.health < history.health || observation.mountHealth < history.mountHealth);
      const released =
        observation.releaseTtl >
        Math.max(0, (history?.releaseTtl ?? 0) - (tick - previousTick) * ACTION_TICK_SECONDS) +
          1e-5;
      const active =
        history?.overlay && !history.overlayExiting
          ? history.overlay.current
          : history?.base.current;
      const playing = active && !active.clip.loop && sample(active, seconds).phase < 1;
      const hitPlaying = playing && active.role === "hit";
      const release =
        presentation.actions.release && (released || (playing && active.role === "release"));
      const melee =
        presentation.actions.melee &&
        (observation.fighting || (playing && active.role === "melee"));
      const background: ActionRole = moving
        ? observation.running
          ? "run"
          : "walk"
        : observation.atEase
          ? "atEase"
          : observation.pikeReady && presentation.actions.pikeReady
            ? "pikeReady"
            : "ready";
      const role: ActionRole = !observation.alive
        ? "death"
        : injured || hitPlaying
          ? "hit"
          : release
            ? "release"
            : melee
              ? "melee"
              : background;
      const track = (role: ActionRole): Track => {
        const binding = presentation.actions[role];
        const clip = this.appearances[observation.appearanceId].animation.clips.find(
          (c) => c.name === binding?.clip,
        );
        if (!clip) throw new Error(`appearance ${observation.appearanceId} has no ${role} action`);
        return {
          role,
          clip,
          started: seconds,
          startPhase:
            role === "release"
              ? Math.min(
                  1,
                  clip.markers!.release! +
                    Math.max(0, observation.releaseAgeSeconds) / clip.duration,
                )
              : 0,
        };
      };
      const upperBody = presentation.actions[role]?.layer === "riderUpperBody";
      const baseTrack = track(upperBody ? background : role);
      const restart = injured || (role === "release" && released) || (role === "melee" && !playing);
      // Equipment can change skeleton/clip indices; never carry a blend across bundles.
      const sameAppearance = history?.appearanceId === observation.appearanceId;
      const previous = sameAppearance ? playback(history, seconds) : undefined;
      const appearance = this.appearances[observation.appearanceId];
      const freezeBase = () =>
        evaluatePlaybackPose(
          appearance,
          role === "hit" || role === "death"
            ? previous!
            : { appearanceId: observation.appearanceId, base: previous!.base },
        );
      const freezeComposed = () => evaluatePlaybackPose(appearance, previous!);
      const base = transition(
        sameAppearance ? history.base : undefined,
        baseTrack,
        seconds,
        freezeBase,
        !upperBody && restart,
      );
      history = {
        ...history,
        appearanceId: observation.appearanceId,
        moving,
        health: observation.health,
        mountHealth: observation.mountHealth,
        releaseTtl: observation.releaseTtl,
        base,
      };
      if (!sameAppearance) {
        history.overlay = undefined;
        history.overlayExiting = false;
      }
      if (upperBody) {
        const source = history.overlay ?? {
          current: base.current,
          source: { kind: "clip" as const, sample: sample(base.current, seconds) },
          changed: seconds - BLEND_SECONDS,
        };
        const freeze = previous
          ? freezeComposed
          : () =>
              evaluatePlaybackPose(appearance, {
                appearanceId: observation.appearanceId,
                base: blend(base, seconds),
              });
        history.overlay = transition(
          source,
          track(role),
          seconds,
          freeze,
          restart || history.overlayExiting,
        );
        history.overlayExiting = false;
      } else if (role === "death" || role === "hit") {
        history.overlay = undefined;
        history.overlayExiting = false;
      } else if (history.overlay) {
        if (!history.overlayExiting)
          history.overlay = transition(
            history.overlay,
            base.current,
            seconds,
            freezeComposed,
            true,
          );
        else history.overlay.current = base.current;
        history.overlayExiting = true;
        if (blend(history.overlay, seconds).weight === 1) history.overlay = undefined;
      }
      if (blend(history.base, seconds).weight === 1)
        history.base.source = blend(history.base, seconds).source;
      if (history.overlay && blend(history.overlay, seconds).weight === 1)
        history.overlay.source = blend(history.overlay, seconds).source;
      nextHistories[index] = history;
      return playback(history, seconds);
    });
    this.histories = nextHistories;
    this.tick = tick;
    return output;
  }
}
