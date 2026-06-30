// S3 perf-spike card bar: the SAME Total-War unit-card strip as the vanilla
// UnitCards, but the structure is React and the 60Hz refresh is imperative.
//
// The architecture the whole migration hinges on (README decision 3): React
// builds the card STRUCTURE only — and only when the roster changes (rare). The
// per-frame bar widths / colours / count / sel / rout are written straight to
// ref'd DOM nodes by the existing rAF loop, through the SAME cardStateKey +
// applyCardVisual helpers the vanilla bar uses. React's render/commit never runs
// at 60Hz. S3 measures this against the vanilla bar; S6 keeps whichever wins.

import {
  createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
  type CSSProperties,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { modelLookForClass } from '../../../../packages/game-renderer/src/models/shared/soldierModel';
import { cardThumbUrl } from '../../battle/classData';
import {
  applyCardGrid, applyCardVisual, cardStateKey, drawPortrait, FACTION_CSS, MINIMAP_RESERVE,
  type CardBarRefs, type UnitCardInit, type UnitCardState,
} from '../../battle/unitCard';

/** Imperative handle the rAF loop drives every frame — never triggers a render. */
export interface UnitCardsHandle {
  update(states: (UnitCardState | null)[]): void;
}

interface ViewProps {
  units: UnitCardInit[];
  onSelect: (unit: number, additive: boolean) => void;
  sideReserve: number;
  rootEl: HTMLElement;
}

/** Baked-model portrait <img>, falling back to the flat canvas drawing if the
 * look is unbaked or the PNG fails — same contract as the vanilla portrait(). */
function Portrait({ u }: { u: UnitCardInit }) {
  const look = u.look ?? modelLookForClass(u.cls);
  const url = cardThumbUrl(look);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if ((!url || failed) && canvasRef.current) drawPortrait(canvasRef.current, u.cls, u.look, u.team);
  }, [url, failed, u]);
  if (url && !failed) {
    return <img className="ucard-port" loading="eager" decoding="async" alt={u.name} src={url} onError={() => setFailed(true)} />;
  }
  return <canvas className="ucard-port" ref={canvasRef} />;
}

const UnitCardsView = forwardRef<UnitCardsHandle, ViewProps>(function UnitCardsView(props, ref) {
  // Refs to the live nodes, rebuilt each render (= each roster change). Cleared
  // at the top of render so a shrinking roster never leaves stale detached nodes;
  // the callback refs below repopulate them during commit.
  const cardEls = useRef<HTMLElement[]>([]);
  const barRefs = useRef<CardBarRefs[]>([]);
  const keys = useRef<string[]>([]);
  cardEls.current = [];
  barRefs.current = [];
  keys.current = props.units.map(() => '');

  // Layout effect (not passive) so the grid vars are set synchronously within
  // build()'s flushSync — matching the vanilla bar, which relayouts inline.
  // A passive effect runs after paint, leaving a one-frame default-grid reflow
  // that nudged the 3-row layout by a subpixel.
  useLayoutEffect(() => {
    applyCardGrid(props.rootEl, props.units.length, props.sideReserve);
    const onResize = () => applyCardGrid(props.rootEl, props.units.length, props.sideReserve);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [props.units, props.rootEl, props.sideReserve]);

  useImperativeHandle(ref, () => ({
    update(states) {
      const cards = cardEls.current, bars = barRefs.current, ks = keys.current;
      for (let i = 0; i < cards.length; i++) {
        const s = i < states.length ? states[i] : null;
        const card = cards[i];
        if (!card) continue;
        if (!s) { card.style.display = 'none'; continue; }
        card.style.display = '';
        const key = cardStateKey(s);
        if (key === ks[i]) continue;
        ks[i] = key;
        applyCardVisual(card, bars[i], s);
      }
    },
  }), []);

  const bar = (i: number, slot: keyof CardBarRefs) => (el: HTMLElement | null) => {
    if (el) (barRefs.current[i] ??= {} as CardBarRefs)[slot] = el;
  };

  return (
    <>
      {props.units.map((u, i) => (
        <div
          key={i}
          className="ucard"
          style={{ ['--fac']: FACTION_CSS[u.team] } as CSSProperties}
          ref={(el) => { if (el) cardEls.current[i] = el; }}
          onMouseDown={(e) => { e.stopPropagation(); props.onSelect(u.unit, e.shiftKey); }}
        >
          <div className="ucard-hp">
            <div className="ucard-hp-fill" ref={bar(i, 'hp')} />
            <div className="ucard-count" ref={bar(i, 'count')} />
          </div>
          <Portrait u={u} />
          <div className="ucard-name">{u.name}</div>
          <div className="ucard-bars">
            <div className="ucard-bar coh"><div ref={bar(i, 'coh')} /></div>
            <div className="ucard-bar mor"><div ref={bar(i, 'mor')} /></div>
          </div>
        </div>
      ))}
    </>
  );
});

/** Drop-in for the vanilla `UnitCards` (same build/update surface) so BattleScene
 * picks one by a flag and the rAF call site is identical for the measurement. */
export class UnitCardsReact {
  private root: Root;
  private handle: UnitCardsHandle | null = null;

  constructor(
    private container: HTMLElement,
    private onSelect: (unit: number, additive: boolean) => void,
    private sideReserve: number = MINIMAP_RESERVE,
  ) {
    this.root = createRoot(container);
  }

  /** (Re)build the structure. flushSync so the refs are live before the next
   * update() — build is rare (roster change), so the sync commit is fine. */
  build(units: UnitCardInit[]) {
    flushSync(() => {
      this.root.render(createElement(UnitCardsView, {
        units, onSelect: this.onSelect, sideReserve: this.sideReserve, rootEl: this.container,
        ref: (h: UnitCardsHandle | null) => { this.handle = h; },
      }));
    });
  }

  update(states: (UnitCardState | null)[]) {
    this.handle?.update(states);
  }

  destroy() {
    this.root.unmount();
  }
}
