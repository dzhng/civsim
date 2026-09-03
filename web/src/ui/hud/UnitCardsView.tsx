// The Total-War unit-card strip STRUCTURE, as a shared React leaf.
//
// The load-bearing seam of the React UI (see specs/done/ui-react-migration): React
// builds the card STRUCTURE only — and only when the roster changes (rare). The
// per-frame bar widths / colours / count / sel / rout are written straight to
// ref'd DOM nodes by the existing rAF loop, through the SAME cardStateKey +
// applyCardVisual helpers, so React's render/commit never runs at 60Hz. A perf
// spike measured this against the old vanilla bar (Δ ≈ 0); keep that true — never
// route a per-frame value through React state.
//
// Extracted from UnitCardsReact so BOTH the single-root <BattleHud> (which composes
// this leaf under its own root) and the UnitCardsReact class wrapper (its own root,
// used by the renderer-lab) share one card-grid implementation. The only shape
// change from the inlined version: the grid host arrives as a `rootRef` (a
// RefObject) rather than a resolved element, so a parent that RENDERS the
// `#unitcards` container can pass its ref before the node is committed.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { modelLookForClass } from "@packages/game-renderer/src/models/shared/soldierModel";
import { cardThumbUrl } from "../../battle/classData";
import {
  applyCardGrid,
  applyCardVisual,
  cardStateKey,
  drawPortrait,
  FACTION_CSS,
  type CardBarRefs,
  type UnitCardInit,
  type UnitCardState,
} from "../../battle/unitCard";

/** Imperative handle the rAF loop drives every frame — never triggers a render. */
export interface UnitCardsHandle {
  update(states: (UnitCardState | null)[]): void;
}

export interface UnitCardsViewProps {
  units: UnitCardInit[];
  onSelect: (unit: number, additive: boolean) => void;
  /** Viewport space reserved for the bottom-corner HUD (info card on the left,
   * minimap on the right); asymmetric in the game, equal in the lab. */
  leftReserve: number;
  rightReserve: number;
  /** The `#unitcards` grid host — applyCardGrid writes its CSS vars here. A
   * RefObject (not a resolved element) so a parent that renders the container can
   * pass its ref before commit; the layout effect reads `.current` post-commit. */
  rootRef: RefObject<HTMLElement | null>;
}

/** Baked-model portrait <img>, falling back to the flat canvas drawing if the
 * look is unbaked or the PNG fails — same contract as the vanilla portrait().
 * Shared with the custom-battle army builder's recruitment cards. */
export function Portrait({ u }: { u: UnitCardInit }) {
  const look = u.look ?? modelLookForClass(u.cls);
  const url = cardThumbUrl(look);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if ((!url || failed) && canvasRef.current)
      drawPortrait(canvasRef.current, u.cls, u.look, u.team);
  }, [url, failed, u]);
  if (url && !failed) {
    return (
      <img
        className="ucard-port"
        loading="eager"
        decoding="async"
        alt={u.name}
        src={url}
        onError={() => setFailed(true)}
      />
    );
  }
  return <canvas className="ucard-port" ref={canvasRef} />;
}

export const UnitCardsView = forwardRef<UnitCardsHandle, UnitCardsViewProps>(
  function UnitCardsView(props, ref) {
    // Refs to the live nodes, rebuilt each render (= each roster change). Cleared
    // at the top of render so a shrinking roster never leaves stale detached nodes;
    // the callback refs below repopulate them during commit.
    const cardEls = useRef<HTMLElement[]>([]);
    const barRefs = useRef<CardBarRefs[]>([]);
    const keys = useRef<string[]>([]);
    cardEls.current = [];
    barRefs.current = [];
    keys.current = props.units.map(() => "");

    // Layout effect (not passive) so the grid vars are set synchronously within
    // build()'s flushSync — matching the vanilla bar, which relayouts inline.
    // A passive effect runs after paint, leaving a one-frame default-grid reflow
    // that nudged the 3-row layout by a subpixel.
    const { rootRef, units, leftReserve, rightReserve } = props;
    useLayoutEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const relayout = () => applyCardGrid(root, units.length, leftReserve, rightReserve);
      relayout();
      window.addEventListener("resize", relayout);
      return () => window.removeEventListener("resize", relayout);
    }, [rootRef, units, leftReserve, rightReserve]);

    useImperativeHandle(
      ref,
      () => ({
        update(states) {
          const cards = cardEls.current,
            bars = barRefs.current,
            ks = keys.current;
          for (let i = 0; i < cards.length; i++) {
            const s = i < states.length ? states[i] : null;
            const card = cards[i];
            if (!card) continue;
            if (!s) {
              card.style.display = "none";
              continue;
            }
            card.style.display = "";
            const key = cardStateKey(s);
            if (key === ks[i]) continue;
            ks[i] = key;
            applyCardVisual(card, bars[i], s);
          }
        },
      }),
      [],
    );

    const bar = (i: number, slot: keyof CardBarRefs) => (el: HTMLElement | null) => {
      if (el) (barRefs.current[i] ??= {} as CardBarRefs)[slot] = el;
    };

    return (
      <>
        {props.units.map((u, i) => (
          <div
            key={i}
            className="ucard"
            style={{ ["--fac"]: FACTION_CSS[u.team] } as CSSProperties}
            ref={(el) => {
              if (el) cardEls.current[i] = el;
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              props.onSelect(u.unit, e.shiftKey);
            }}
          >
            <div className="ucard-hp">
              <div className="ucard-hp-fill" ref={bar(i, "hp")} />
              <div className="ucard-count" ref={bar(i, "count")} />
            </div>
            <Portrait u={u} />
            <div className="ucard-name">{u.name}</div>
            <div className="ucard-bars">
              <div className="ucard-bar coh">
                <div ref={bar(i, "coh")} />
              </div>
              <div className="ucard-bar mor">
                <div ref={bar(i, "mor")} />
              </div>
            </div>
          </div>
        ))}
      </>
    );
  },
);
