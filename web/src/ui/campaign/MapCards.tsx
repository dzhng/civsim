import { forwardRef, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";

export type MapCardKind = "city" | "army";

export interface MapCardModel {
  id: string;
  kind: MapCardKind;
  name: string;
  factionColor: string;
  incomeText?: string;
  strengthText?: string;
  garrisonName?: string;
  garrisonStrengthText?: string;
}

export interface MapCardPosition {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface MapCardsHandle {
  set(cards: MapCardModel[]): void;
  update(positions: MapCardPosition[]): void;
}

export const MapCards = forwardRef<MapCardsHandle>(function MapCards(_props, ref) {
  const [cards, setCards] = useState<MapCardModel[]>([]);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());

  useImperativeHandle(
    ref,
    () => ({
      set: (next) => {
        flushSync(() => setCards(next));
        const nextIds = new Set(next.map((card) => card.id));
        for (const id of nodeRefs.current.keys()) {
          if (!nextIds.has(id)) nodeRefs.current.delete(id);
        }
      },
      update: (positions) => {
        const visibleIds = new Set<string>();
        for (const pos of positions) {
          const node = nodeRefs.current.get(pos.id);
          if (!node) continue;
          visibleIds.add(pos.id);
          node.style.display = pos.visible ? "block" : "none";
          if (pos.visible) {
            node.style.transform = `translate3d(${pos.x}px,${pos.y}px,0) translate(-50%,0)`;
          }
        }
        for (const [id, node] of nodeRefs.current) {
          if (!visibleIds.has(id)) node.style.display = "none";
        }
      },
    }),
    [],
  );

  return (
    <div className="cmp-map-cards">
      {cards.map((card) => (
        <div
          key={card.id}
          ref={(node) => {
            if (node) nodeRefs.current.set(card.id, node);
            else nodeRefs.current.delete(card.id);
          }}
          className={`cmp-map-card cmp-map-card--${card.kind}`}
          style={{ "--cmp-card-faction": card.factionColor } as CSSProperties}
        >
          <div className="cmp-map-card__band" />
          <div className="cmp-map-card__body">
            <div className="cmp-map-card__name">{card.name}</div>
            {card.kind === "city" ? (
              <div className="cmp-map-card__income">
                <span className="cmp-map-card__coin" />
                {card.incomeText}
              </div>
            ) : (
              <div className="cmp-map-card__strength">{card.strengthText}</div>
            )}
          </div>
          {card.garrisonName ? (
            <div className="cmp-map-card__garrison">
              <b>{card.garrisonName}</b>
              <span>{card.garrisonStrengthText}</span>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
});
