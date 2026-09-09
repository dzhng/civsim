import type { AppearancePresentation, ActionRole } from "../../soldier-assets/src/presentation";
import { isGaitRole } from "../../soldier-assets/src/presentation";
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
  /** Motor-capable tick-path length over the observation interval, divided by time.
   * Includes enabled pressure recovery, not disabled transport or proof of propulsion. */
  speedMps: number;
  /** Qualified net travel over that interval in the final presented facing basis:
   * forward positive, backward negative. Reversals can cancel net travel, not path. */
  forwardMps: number;
  /** Qualified net travel rate to the presented soldier's right (negative to the left). */
  lateralMps: number;
  routing: boolean;
  /** Current engine steering-disable condition (stunned or bowled). */
  incapacitated: boolean;
  /** Selected defensive/retained facing branch of the displayed-facing owner.
   * Protection also requires !atEase: safe withdrawal can retain facing.
   * Not stepping authority: enabled displacement can include a shove. */
  guardedFacing: boolean;
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
type ActionClip = Pick<
  LocalAnimationClip,
  "name" | "duration" | "loop" | "markers" | "strideMeters"
>;
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

function sameSample(a: ClipSample, b: ClipSample): boolean {
  return a.clip === b.clip && a.phase === b.phase;
}
function sameSource(a: PoseSource, b: PoseSource): boolean {
  return a.kind === "frozen" ? a === b : b.kind === "clip" && sameSample(a.sample, b.sample);
}
function samePlayback(a: SoldierPlayback, b: SoldierPlayback): boolean {
  if (
    a.appearanceId !== b.appearanceId ||
    a.base.weight !== b.base.weight ||
    !sameSource(a.base.source, b.base.source) ||
    !sameSample(a.base.destination, b.base.destination)
  )
    return false;
  const x = a.riderUpperBody,
    y = b.riderUpperBody;
  if (!x || !y) return x === y;
  return (
    x.weight === y.weight &&
    sameSource(x.source, y.source) &&
    ("kind" in x.destination
      ? "kind" in y.destination && x.destination.kind === y.destination.kind
      : !("kind" in y.destination) && sameSample(x.destination, y.destination))
  );
}

/** Two captures cover adjacent base/upper-body transitions. Exact reuse is only
 * an optimization: unrelated histories evaluate normally, with no growing map
 * or phase rounding. Memo entries do not survive the update. */
function frozenPoseCapture() {
  type Entry = { appearance: PlaybackAppearance; playback: SoldierPlayback; source: PoseSource };
  let first: Entry | undefined, second: Entry | undefined;
  return (appearance: PlaybackAppearance, playback: SoldierPlayback): PoseSource => {
    if (first?.appearance === appearance && samePlayback(first.playback, playback))
      return first.source;
    if (second?.appearance === appearance && samePlayback(second.playback, playback)) {
      const hit = second;
      second = first;
      first = hit;
      return hit.source;
    }
    const source: PoseSource = Object.freeze({
      kind: "frozen",
      locals: Object.freeze(Array.from(evaluatePlaybackPose(appearance, playback))),
    });
    const entry = second ?? { appearance, playback, source };
    entry.appearance = appearance;
    entry.playback = playback;
    entry.source = source;
    second = first;
    first = entry;
    return source;
  };
}

interface Track {
  role: ActionRole;
  clip: ActionClip;
  started: number;
  startPhase: number;
  /** Cycles per second from the latest measured motion; absent for time-driven actions. */
  phaseRate?: number;
}
interface Lane {
  current: Track;
  source: PoseSource;
  changed: number;
}
interface History extends Pick<
  ActionObservation,
  | "appearanceId"
  | "incapacitated"
  | "atEase"
  | "pikeReady"
  | "guardedFacing"
  | "routing"
  | "health"
  | "mountHealth"
  | "releaseTtl"
> {
  moving: boolean;
  base: Lane;
  overlay?: Lane;
  overlayExiting?: boolean;
}

const BLEND_SECONDS = 0.15;
export const ACTION_TICK_SECONDS = 1 / 30;
function sample(track: Track, seconds: number): ClipSample {
  const progress =
    track.clip.duration > 0
      ? track.startPhase +
        Math.max(0, seconds - track.started) * (track.phaseRate ?? 1 / track.clip.duration)
      : 0;
  return { clip: track.clip.name, phase: track.clip.loop ? progress % 1 : Math.min(1, progress) };
}
function blendWeight(lane: Lane, seconds: number): number {
  return Math.min(1, Math.max(0, seconds - lane.changed) / BLEND_SECONDS);
}
function blend(lane: Lane, seconds: number): ClipBlend {
  const destination = sample(lane.current, seconds);
  const weight = blendWeight(lane, seconds);
  return {
    source: weight === 1 ? { kind: "clip", sample: destination } : lane.source,
    destination,
    weight,
  };
}
function releaseFrozenSource(lane: Lane, seconds: number): void {
  // Settled playback samples the current track directly; only an owned snapshot
  // needs retirement here. Do not rebuild ignored clip sources every observation.
  if (lane.source.kind === "frozen" && blendWeight(lane, seconds) === 1)
    lane.source = { kind: "clip", sample: sample(lane.current, seconds) };
}
function playback(history: History, seconds: number): SoldierPlayback {
  const result: SoldierPlayback = {
    appearanceId: history.appearanceId,
    base: blend(history.base, seconds),
  };
  if (history.overlay) {
    const upper = blend(history.overlay, seconds);
    result.riderUpperBody = history.overlayExiting
      ? { ...upper, destination: { kind: "base" } }
      : upper;
  }
  return result;
}
function transition(
  lane: Lane | undefined,
  current: Track,
  seconds: number,
  freeze: () => PoseSource,
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
    source: freeze(),
    changed: seconds,
  };
}

/** Render-only histories follow observed simulation time; no wall clock or combat writes. */
export class ActionTimeline {
  private histories: History[] = [];
  // One interval only: shells own lane edits; immutable source payloads stay shared.
  private completed?: { tick: number; histories: (History | undefined)[] };
  private tick = -Infinity;
  private readonly rigLayouts: Record<number, string>;
  constructor(private appearances: Readonly<Record<number, PlaybackAppearance>>) {
    // Only identical local spaces permit pose reuse; this is not retargeting.
    this.rigLayouts = Object.fromEntries(
      Object.entries(appearances).map(([id, appearance]) => [
        id,
        JSON.stringify(
          appearance.rig.bones.map((bone) => [
            bone.name,
            bone.parent,
            bone.bind.T,
            bone.bind.R,
            bone.bind.S,
            Array.from(bone.inverseBind),
          ]),
        ),
      ]),
    );
  }

  reset(): void {
    this.histories = [];
    this.completed = undefined;
    this.tick = -Infinity;
  }

  /** Unique owned numeric payload bytes, excluding overhead and consumer-held samples. */
  get snapshotBytes(): number {
    let bytes = 0;
    const counted = new Set<PoseSource>();
    for (const history of [...this.histories, ...(this.completed?.histories ?? [])]) {
      if (!history) continue;
      for (const lane of [history.base, history.overlay])
        if (lane?.source.kind === "frozen" && !counted.has(lane.source)) {
          counted.add(lane.source);
          bytes += lane.source.locals.length * 8;
        }
    }
    return bytes;
  }

  /** Before samples only the latest completed endpoint, before its observed events. */
  sample(tick = this.tick, boundary: "before" | "after" = "after"): SoldierPlayback[] {
    if (boundary === "before" && (!this.completed || tick !== this.tick))
      throw new Error("before boundary requires the latest completed observation");
    if (this.histories.length === 0) return [];
    if (!Number.isFinite(tick) || tick < (this.completed?.tick ?? this.tick))
      throw new Error("cannot sample before the retained observation or at invalid time");
    return this.histories.map((history, index) => {
      const past =
        tick < this.tick || boundary === "before" ? this.completed?.histories[index] : undefined;
      return playback(
        past ?? history,
        (past ? tick : Math.max(tick, this.tick)) * ACTION_TICK_SECONDS,
      );
    });
  }

  /** Observe atomically; sample() is the sole playback-output owner. */
  update(tick: number, observations: readonly ActionObservation[]): void {
    if (!Number.isFinite(tick)) throw new Error("action timeline requires finite simulation time");
    const resetting = tick < this.tick || observations.length < this.histories.length;
    const previousHistories = resetting ? [] : this.histories;
    const previousTick = resetting ? -Infinity : this.tick;
    const nextHistories: History[] = [];
    const completed =
      resetting || !Number.isFinite(previousTick)
        ? undefined
        : tick === previousTick
          ? this.completed
          : { tick: previousTick, histories: [] as (History | undefined)[] };
    const seconds = tick * ACTION_TICK_SECONDS;
    const freezePlayback = frozenPoseCapture();
    observations.forEach((observation, index) => {
      const prior = previousHistories[index];
      if (completed && tick !== previousTick) completed.histories[index] = prior;
      let history = prior && {
        ...prior,
        base: { ...prior.base },
        overlay: prior.overlay && { ...prior.overlay },
      };
      if (history && (tick === previousTick || history.base.current.role === "death")) {
        releaseFrozenSource(history.base, seconds);
        nextHistories[index] = history;
        return;
      }
      const presentation = this.appearances[observation.appearanceId]?.manifest.presentation;
      if (!presentation)
        throw new Error(`appearance ${observation.appearanceId} is manual-only or missing`);
      const moving = marchingStateForSpeed(observation.speedMps, history?.moving ?? false);
      const validSpeed = Number.isFinite(observation.speedMps) && observation.speedMps >= 0;
      const speed = validSpeed ? observation.speedMps : 0;
      // Qualified path is uniform over this interval and belongs to its eligible left gait.
      if (
        history &&
        !history.incapacitated &&
        history.appearanceId === observation.appearanceId &&
        isGaitRole(history.base.current.role)
      ) {
        const old = history.base.current;
        const phaseRate = speed / old.clip.strideMeters!;
        if (phaseRate !== old.phaseRate)
          history.base.current = {
            ...old,
            started: previousTick * ACTION_TICK_SECONDS,
            startPhase: sample(old, previousTick * ACTION_TICK_SECONDS).phase,
            phaseRate,
          };
      }
      const actionClip = (role: ActionRole) => {
        const clip = this.appearances[observation.appearanceId].animation.clips.find(
          (clip) => clip.name === presentation.actions[role]?.clip,
        );
        if (!clip) throw new Error(`appearance ${observation.appearanceId} has no ${role} action`);
        return clip;
      };
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
      // Choose the nearest authored nominal pace, not the order's requested exertion.
      const nominalSpeed = (role: "walk" | "run") => {
        const clip = actionClip(role);
        return clip.strideMeters! / clip.duration;
      };
      const run =
        moving && validSpeed
          ? speed > (nominalSpeed("walk") + nominalSpeed("run")) / 2
          : history?.base.current.role === "run";
      const standing: ActionRole = observation.atEase
        ? "atEase"
        : observation.pikeReady && presentation.actions.pikeReady
          ? "pikeReady"
          : "ready";
      const { forwardMps, lateralMps } = observation;
      const direction: ActionRole | undefined =
        Math.abs(lateralMps) > Math.abs(forwardMps)
          ? lateralMps < 0
            ? "guardedLeftWalk"
            : "guardedRightWalk"
          : forwardMps < 0
            ? "guardedBackwardWalk"
            : undefined;
      const protectedRole =
        moving &&
        !observation.atEase &&
        observation.guardedFacing &&
        !observation.routing &&
        direction &&
        presentation.actions[direction]
          ? direction
          : undefined;
      // Infer onset only over compatible background standing, never past combat or disability.
      if (
        history &&
        history.appearanceId === observation.appearanceId &&
        !history.incapacitated &&
        !history.overlay &&
        moving &&
        speed > 0 &&
        ["atEase", "ready", "pikeReady"].includes(history.base.current.role) &&
        history.atEase === observation.atEase &&
        history.pikeReady === observation.pikeReady &&
        history.guardedFacing === observation.guardedFacing &&
        history.routing === observation.routing
      ) {
        const inferredRole = protectedRole ?? (run ? "run" : "walk");
        const clip = actionClip(inferredRole);
        const started = previousTick * ACTION_TICK_SECONDS;
        const source = freezePlayback(
          this.appearances[observation.appearanceId],
          playback(history, started),
        );
        history.base = {
          current: {
            role: inferredRole,
            clip,
            started,
            startPhase: 0,
            phaseRate: speed / clip.strideMeters!,
          },
          source,
          changed: started,
        };
      }
      if (completed && tick !== previousTick)
        completed.histories[index] = history && {
          ...history,
          base: { ...history.base },
          overlay: history.overlay && { ...history.overlay },
        };
      const oldGait =
        history?.appearanceId === observation.appearanceId && isGaitRole(history.base.current.role)
          ? history.base.current.role
          : undefined;
      const background: ActionRole = observation.incapacitated
        ? (oldGait ?? standing)
        : moving
          ? (protectedRole ?? (run ? "run" : "walk"))
          : standing;
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
        const clip = actionClip(role);
        const locomotion = isGaitRole(role);
        const phaseRate = locomotion && !observation.incapacitated ? speed / clip.strideMeters! : 0;
        const old =
          history?.appearanceId === observation.appearanceId ? history.base.current : undefined;
        // Keep the same arithmetic anchor while the measured rate is unchanged.
        // Re-anchoring an identical trajectory can round an interruption pose differently.
        if (locomotion && old?.role === role && old.clip === clip && old.phaseRate === phaseRate)
          return old;
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
              : locomotion && old
                ? old.phaseRate !== undefined
                  ? sample(old, seconds).phase
                  : 0
                : 0,
          ...(locomotion ? { phaseRate } : {}),
        };
      };
      const upperBody = presentation.actions[role]?.layer === "riderUpperBody";
      const baseTrack = track(upperBody ? background : role);
      const restart = injured || (role === "release" && released) || (role === "melee" && !playing);
      // Equipment identity changes immediately; compatible body locals may blend,
      // but clip indices never cross bundles.
      const sameAppearance = history?.appearanceId === observation.appearanceId;
      const previousHistory = history;
      let previous: SoldierPlayback | undefined;
      // Transition callbacks run only when a lane changes. Capture the old history
      // before rebinding it so base and overlay interruptions freeze the same pose.
      const priorPlayback = () => (previous ??= playback(previousHistory!, seconds));
      const appearance = this.appearances[observation.appearanceId];
      const freezeBase = () => {
        const pose = priorPlayback();
        return freezePlayback(
          appearance,
          role === "hit" || role === "death"
            ? pose
            : { appearanceId: observation.appearanceId, base: pose.base },
        );
      };
      const freezeComposed = () => freezePlayback(appearance, priorPlayback());
      const base =
        !sameAppearance &&
        history &&
        this.rigLayouts[history.appearanceId] === this.rigLayouts[observation.appearanceId]
          ? {
              current: baseTrack,
              source: freezePlayback(this.appearances[history.appearanceId], priorPlayback()),
              changed: seconds,
            }
          : transition(
              sameAppearance ? history.base : undefined,
              baseTrack,
              seconds,
              freezeBase,
              !upperBody && restart,
            );
      if (baseTrack.phaseRate !== undefined) base.current = baseTrack;
      history = {
        ...history,
        appearanceId: observation.appearanceId,
        incapacitated: observation.incapacitated,
        atEase: observation.atEase,
        pikeReady: observation.pikeReady,
        guardedFacing: observation.guardedFacing,
        routing: observation.routing,
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
        const freeze = sameAppearance
          ? freezeComposed
          : () =>
              freezePlayback(appearance, {
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
        if (blendWeight(history.overlay, seconds) === 1) history.overlay = undefined;
      }
      releaseFrozenSource(history.base, seconds);
      if (history.overlay) releaseFrozenSource(history.overlay, seconds);
      nextHistories[index] = history;
    });
    this.histories = nextHistories;
    this.completed = completed;
    this.tick = tick;
  }
}
