// The whole battle HUD as ONE React tree under a single root (see
// specs/hud-housings, slice 01). This collapses the three separate createRoot
// calls (#hud, #toolbar, #unitcards) and the imperative minimap canvas that the
// ui-react-migration left as scaffolding into one <BattleHud>. scene.ts drives it
// through the imperative BattleHudHandle at the same cadences as before:
//   - cards.update(): every rAF frame, straight to ref'd DOM nodes (60Hz firewall,
//     never React state — see UnitCardsView).
//   - setInfo()/setToolbar(): ≤5Hz, each flushSync so snapshots stay deterministic
//     exactly like the old flushSync(root.render(...)) calls.
//   - buildCards(): rare (roster change), flushSync so refs are live before update.
//   - minimapCanvas: a <canvas> React only DECLARES; scene.ts owns its pixels.
//
// Each surface is its own stateful island: setInfo re-renders only the left card,
// setToolbar only the toolbar. The parent <BattleHud> holds no data state, so it
// never re-renders and the card grid (a sibling) is never reconciled by a HUD or
// toolbar refresh. Slices 03–07 turn this composition into the three bronze
// housings; slice 01 keeps every element's id and position identical.

import { forwardRef, useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HudPanel, type HudData } from "./HudPanel";
import { Toolbar, type ToolButtonState } from "./Toolbar";
import { TooltipProvider } from "./Tooltip";
import { UnitCardsView, type UnitCardsHandle } from "./UnitCardsView";
import {
  BOTTOM_CARD_LEFT_RESERVE,
  BOTTOM_CARD_RIGHT_RESERVE,
  type UnitCardInit,
  type UnitCardState,
} from "../../battle/unitCard";

export interface BattleHudHandle {
  /** Left info card content (≤5Hz, flushSync). */
  setInfo(data: HudData): void;
  /** Bare top-left FPS telemetry text, e.g. "fps 60" (or "fps —" when frozen). */
  setFps(text: string): void;
  /** Toolbar button state (≤5Hz, flushSync); onCmd is wired at mount. */
  setToolbar(state: Record<string, ToolButtonState>): void;
  /** Rebuild the card structure on a roster change (flushSync). */
  buildCards(units: UnitCardInit[]): void;
  /** The unchanged 60Hz per-frame card paint handle. */
  cards: UnitCardsHandle;
  /** The minimap canvas scene.ts draws into. */
  readonly minimapCanvas: HTMLCanvasElement;
  destroy(): void;
}

interface InfoHandle {
  set(data: HudData): void;
}
const LeftInfoCard = forwardRef<InfoHandle>(function LeftInfoCard(_props, ref) {
  const [data, setData] = useState<HudData | null>(null);
  useImperativeHandle(ref, () => ({ set: (d) => flushSync(() => setData(d)) }), []);
  return (
    <div id="hud" className="hud-chassis">
      {data ? <HudPanel data={data} /> : "loading wasm…"}
    </div>
  );
});

interface FpsHandle {
  set(text: string): void;
}
// Bare, non-diegetic dev telemetry — NOT HUD chrome, so intentionally a faint
// transparent-background readout with no housing (the aesthetics "no transparency"
// rule governs game panels, not this). pointer-events:none so it never eats clicks.
const FpsReadout = forwardRef<FpsHandle>(function FpsReadout(_props, ref) {
  const [text, setText] = useState("");
  useImperativeHandle(ref, () => ({ set: (t) => flushSync(() => setText(t)) }), []);
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
});

interface ToolbarHandle {
  set(state: Record<string, ToolButtonState>): void;
}
const ToolbarHost = forwardRef<ToolbarHandle, { onCmd(cmd: string): void }>(
  function ToolbarHost(props, ref) {
    const [state, setState] = useState<Record<string, ToolButtonState> | null>(null);
    useImperativeHandle(ref, () => ({ set: (s) => flushSync(() => setState(s)) }), []);
    return <div id="toolbar">{state ? <Toolbar state={state} onCmd={props.onCmd} /> : null}</div>;
  },
);

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
  setToolbar(state: Record<string, ToolButtonState>): void;
}
// The bottom-center housing: card wells on top, order/time control strip below,
// in ONE bronze tray (specs/hud-housings, slice 05). A structural wrapper holding
// NO data state, so it never re-renders — cards and toolbar stay separate stateful
// islands (CardsHost / ToolbarHost), and a ≤5Hz toolbar refresh never reconciles
// the 60Hz card grid. applyCardGrid writes onto this #battle-center element.
const CenterCard = forwardRef<
  CenterHandle,
  { onSelect(unit: number, additive: boolean): void; onToolbarCmd(cmd: string): void }
>(function CenterCard(props, ref) {
  const centerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<CardsHostHandle>(null);
  const toolbarRef = useRef<ToolbarHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      buildCards: (u) => cardsRef.current?.build(u),
      updateCards: (s) => cardsRef.current?.update(s),
      setToolbar: (s) => toolbarRef.current?.set(s),
    }),
    [],
  );
  return (
    <div id="battle-center" className="hud-chassis hud-chassis--tray" ref={centerRef}>
      <CardsHost ref={cardsRef} onSelect={props.onSelect} gridRootRef={centerRef} />
      <ToolbarHost ref={toolbarRef} onCmd={props.onToolbarCmd} />
    </div>
  );
});

interface BattleHudProps {
  onCardSelect(unit: number, additive: boolean): void;
  onToolbarCmd(cmd: string): void;
}

/** Everything but `destroy`, which only the mount owner (holding the Root) can do. */
type BattleHudInnerHandle = Omit<BattleHudHandle, "destroy">;

const BattleHud = forwardRef<BattleHudInnerHandle, BattleHudProps>(function BattleHud(props, ref) {
  const infoRef = useRef<InfoHandle>(null);
  const fpsRef = useRef<FpsHandle>(null);
  const centerRef = useRef<CenterHandle>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      setInfo: (d) => infoRef.current?.set(d),
      setFps: (t) => fpsRef.current?.set(t),
      setToolbar: (s) => centerRef.current?.setToolbar(s),
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
      <LeftInfoCard ref={infoRef} />
      <FpsReadout ref={fpsRef} />
      <CenterCard ref={centerRef} onSelect={props.onCardSelect} onToolbarCmd={props.onToolbarCmd} />
      <canvas id="minimap" className="hud-chassis" width={240} height={160} ref={miniRef} />
    </TooltipProvider>
  );
});

/** Mount the single-root battle HUD into `container` and return the imperative
 * handle scene.ts drives. flushSync so the child refs (minimap canvas, card view)
 * are live before enter() continues past this call. */
export function mountBattleHud(
  container: HTMLElement,
  cb: { onCardSelect(unit: number, additive: boolean): void; onToolbarCmd(cmd: string): void },
): BattleHudHandle {
  const root = createRoot(container);
  let inner: BattleHudInnerHandle | null = null;
  const capture: Ref<BattleHudInnerHandle> = (h) => {
    inner = h;
  };
  flushSync(() => {
    root.render(
      <BattleHud ref={capture} onCardSelect={cb.onCardSelect} onToolbarCmd={cb.onToolbarCmd} />,
    );
  });
  // Own the Root's lifecycle here; every other method is the component's own.
  return Object.assign(inner!, { destroy: () => root.unmount() });
}
