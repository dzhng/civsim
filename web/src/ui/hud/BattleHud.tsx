// The whole battle HUD as ONE React tree under a single root (see
// specs/done/hud-housings, slice 01). This collapses the three separate createRoot
// calls (#hud, #toolbar, #unitcards) and the imperative minimap canvas that the
// ui-react-migration left as scaffolding into one <BattleHud>. battleLoop.ts drives it
// through its scene-owned store at the same cadences as before:
//   - cards.update(): every rAF frame, straight to ref'd DOM nodes (60Hz firewall,
//     never React state — see UnitCardsView).
//   - HUD state: ≤5Hz through useSyncExternalStore.
//   - buildCards(): rare (roster change), flushSync so refs are live before update.
//   - minimapCanvas: a <canvas> React only DECLARES; the battle loop owns its pixels.
//
// Each surface selects only its own store field, so the card grid (a sibling) is
// never reconciled by a HUD or toolbar refresh.

import { resumeActiveBattleAudio } from "../../battle/battleAudio";
import { forwardRef, useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HudPanel, type HudData } from "./HudPanel";
import { Toolbar, type ToolButtonState } from "./Toolbar";
import { Tooltip, TooltipProvider } from "./Tooltip";
import { UnitCardsView, type UnitCardsHandle } from "./UnitCardsView";
import {
  BOTTOM_CARD_LEFT_RESERVE,
  BOTTOM_CARD_RIGHT_RESERVE,
  type UnitCardInit,
  type UnitCardState,
} from "../../battle/unitCard";
import { toolbarIcon } from "../../battle/toolbarIcons";
import {
  updateGraphicsSettings,
  useGraphicsSettings,
  type GraphicsSettings,
} from "../../shared/graphicsSettings";
import { useHudStore, type HudStore } from "../hudStore";

export interface BattleHudState {
  info: HudData | null;
  fps: string;
  toolbar: Record<string, ToolButtonState> | null;
}

export interface BattleHudHandle {
  /** Rebuild the card structure on a roster change (flushSync). */
  buildCards(units: UnitCardInit[]): void;
  /** The unchanged 60Hz per-frame card paint handle. */
  cards: UnitCardsHandle;
  /** The minimap canvas the battle loop draws into. */
  readonly minimapCanvas: HTMLCanvasElement;
  destroy(): void;
}

function LeftInfoCard({ store }: { store: HudStore<BattleHudState> }) {
  const data = useHudStore(store, (state) => state.info);
  return (
    <div id="hud" className="hud-chassis">
      {data ? <HudPanel data={data} /> : "loading wasm…"}
    </div>
  );
}

// Bare, non-diegetic dev telemetry — NOT HUD chrome, so intentionally a faint
// transparent-background readout with no housing (the aesthetics "no transparency"
// rule governs game panels, not this). pointer-events:none so it never eats clicks.
function FpsReadout({ store }: { store: HudStore<BattleHudState> }) {
  const text = useHudStore(store, (state) => state.fps);
  return (
    <div
      id="fps-readout"
      style={{
        position: "fixed",
        top: 6,
        left: 10,
        font: "11px ui-monospace, Menlo, monospace",
        color: "rgba(240, 235, 220, 0.45)",
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
        pointerEvents: "none",
        zIndex: 4,
        letterSpacing: "0.3px",
      }}
    >
      {text}
    </div>
  );
}

function AudioControls() {
  const settings = useGraphicsSettings();
  const audio = settings.audio;
  const muted = audio.muted || audio.masterVolume <= 0;
  const setAudio = (patch: Partial<GraphicsSettings["audio"]>) =>
    updateGraphicsSettings({ audio: { ...audio, ...patch } });
  return (
    <div id="battle-audio-controls" className="hud-chassis" data-muted={muted ? "true" : "false"}>
      <Tooltip label={muted ? "Ambient audio muted" : "Ambient audio on"}>
        <button
          id="battle-audio-mute"
          type="button"
          aria-label={muted ? "Unmute ambient audio" : "Mute ambient audio"}
          className={muted ? "on" : undefined}
          onClick={() => {
            const nextMuted = !audio.muted;
            if (!nextMuted) resumeActiveBattleAudio();
            setAudio({ muted: nextMuted });
          }}
          dangerouslySetInnerHTML={{ __html: toolbarIcon(muted ? "audioOff" : "audio") }}
        />
      </Tooltip>
      <input
        id="battle-audio-volume"
        type="range"
        min="0"
        max="100"
        step="1"
        aria-label="Ambient audio volume"
        value={Math.round(audio.masterVolume * 100)}
        onChange={(event) => setAudio({ masterVolume: Number(event.currentTarget.value) / 100 })}
      />
    </div>
  );
}

function ToolbarHost(props: { store: HudStore<BattleHudState>; onCmd(cmd: string): void }) {
  const state = useHudStore(props.store, (snapshot) => snapshot.toolbar);
  return <div id="toolbar">{state ? <Toolbar state={state} onCmd={props.onCmd} /> : null}</div>;
}

interface CardsHostHandle {
  build(units: UnitCardInit[]): void;
  update(states: (UnitCardState | null)[]): void;
}
interface CardsHostProps {
  onSelect(unit: number, additive: boolean): void;
  /** The grid host applyCardGrid writes its vars onto — the outer #battle-center,
   * so the whole merged housing (cards + toolbar) tracks the card layout. */
  gridRootRef: RefObject<HTMLElement | null>;
}
const CardsHost = forwardRef<CardsHostHandle, CardsHostProps>(function CardsHost(props, ref) {
  const [units, setUnits] = useState<UnitCardInit[]>([]);
  const viewRef = useRef<UnitCardsHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      build: (u) => flushSync(() => setUnits(u)),
      update: (s) => viewRef.current?.update(s),
    }),
    [],
  );
  return (
    <div id="unitcards">
      <UnitCardsView
        ref={viewRef}
        units={units}
        onSelect={props.onSelect}
        leftReserve={BOTTOM_CARD_LEFT_RESERVE}
        rightReserve={BOTTOM_CARD_RIGHT_RESERVE}
        rootRef={props.gridRootRef}
      />
    </div>
  );
});

interface CenterHandle {
  buildCards(units: UnitCardInit[]): void;
  updateCards(states: (UnitCardState | null)[]): void;
}
// The bottom-center housing: card wells on top, order/time control strip below,
// in ONE bronze tray (specs/done/hud-housings, slice 05). A structural wrapper holding
// NO data state, so it never re-renders — cards and toolbar stay separate stateful
// islands (CardsHost / ToolbarHost), and a ≤5Hz toolbar refresh never reconciles
// the 60Hz card grid. applyCardGrid writes onto this #battle-center element.
const CenterCard = forwardRef<
  CenterHandle,
  {
    store: HudStore<BattleHudState>;
    onSelect(unit: number, additive: boolean): void;
    onToolbarCmd(cmd: string): void;
  }
>(function CenterCard(props, ref) {
  const centerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<CardsHostHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      buildCards: (u) => cardsRef.current?.build(u),
      updateCards: (s) => cardsRef.current?.update(s),
    }),
    [],
  );
  return (
    <div id="battle-center" className="hud-chassis hud-chassis--tray" ref={centerRef}>
      <CardsHost ref={cardsRef} onSelect={props.onSelect} gridRootRef={centerRef} />
      <ToolbarHost store={props.store} onCmd={props.onToolbarCmd} />
    </div>
  );
});

interface BattleHudProps {
  store: HudStore<BattleHudState>;
  onCardSelect(unit: number, additive: boolean): void;
  onToolbarCmd(cmd: string): void;
}

/** Everything but `destroy`, which only the mount owner (holding the Root) can do. */
type BattleHudInnerHandle = Omit<BattleHudHandle, "destroy">;

const BattleHud = forwardRef<BattleHudInnerHandle, BattleHudProps>(function BattleHud(props, ref) {
  const centerRef = useRef<CenterHandle>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      buildCards: (u) => centerRef.current?.buildCards(u),
      cards: { update: (s) => centerRef.current?.updateCards(s) },
      get minimapCanvas() {
        return miniRef.current!;
      },
    }),
    [],
  );
  return (
    <TooltipProvider>
      <LeftInfoCard store={props.store} />
      <FpsReadout store={props.store} />
      <AudioControls />
      <CenterCard
        ref={centerRef}
        store={props.store}
        onSelect={props.onCardSelect}
        onToolbarCmd={props.onToolbarCmd}
      />
      <canvas id="minimap" className="hud-chassis" width={240} height={160} ref={miniRef} />
    </TooltipProvider>
  );
});

/** Mount the single-root battle HUD into `container` and return the imperative
 * handle the battle loop drives. flushSync so the child refs (minimap canvas, card view)
 * are live before enter() continues past this call. */
export function mountBattleHud(
  container: HTMLElement,
  store: HudStore<BattleHudState>,
  cb: { onCardSelect(unit: number, additive: boolean): void; onToolbarCmd(cmd: string): void },
): BattleHudHandle {
  const root = createRoot(container);
  let inner: BattleHudInnerHandle | null = null;
  const capture: Ref<BattleHudInnerHandle> = (h) => {
    inner = h;
  };
  flushSync(() => {
    root.render(
      <BattleHud
        ref={capture}
        store={store}
        onCardSelect={cb.onCardSelect}
        onToolbarCmd={cb.onToolbarCmd}
      />,
    );
  });
  // Own the Root's lifecycle here; every other method is the component's own.
  return Object.assign(inner!, { destroy: () => root.unmount() });
}
