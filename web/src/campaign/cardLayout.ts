// Screen-space card placement; the scene owns projection and DOM measurement.

import { rectsOverlap, type ScreenRect } from "@packages/game-renderer/src/campaign/labelLayout";

export interface MapCardCandidate {
  id: string;
  name: string;
  /** Who wins ground in the culling band: cities above armies, higher tier
   *  above lower. Cities must outrank every army — the full-tilt packing
   *  order below splits on that. */
  priority: number;
  /** City cards at full-tilt zoom nudge on collision; everything else culls. */
  city: boolean;
  /** The city's own screen anchor (model base) — other cards must not cover it
   *  (the campaign-lod "does not bury its own marker" contract). */
  anchor?: [number, number];
  x: number;
  y: number;
  size: { w: number; h: number } | undefined;
  visible: boolean;
  rect?: ScreenRect;
}

/** Breathing room between a nudged city card and the rect it slid below. */
export const CARD_NUDGE_GAP_PX = 4;
/** Clearance a nudged card keeps around a neighbour city's anchor point. */
export const ANCHOR_CLEAR_PX = 6;

/** DOM card rect (CSS px): cards render top-center anchored
 *  (translate3d(x,y) translate(-50%,0) in MapCards). */
function cardRectAt(x: number, y: number, size: { w: number; h: number }): ScreenRect {
  return { x: x - size.w / 2, y, w: size.w, h: size.h };
}

/** Resolve the frame's cards in place: each candidate ends with its final `y`,
 *  `visible` and claimed `rect`; the returned list names the cards that hid.
 *  A card not yet measured (first DOM frame) can't claim or yield; it joins
 *  next frame.
 *
 *  `cityCardsMustShow` is the full-tilt band, where hiding a city card reads as
 *  a missing city (Ostia next to Roma), so a colliding city card slides down
 *  instead of hiding. */
export function resolveMapCards(
  entries: MapCardCandidate[],
  cityCardsMustShow: boolean,
): { culls: string[] } {
  const claimed: ScreenRect[] = [];
  const culls: string[] = [];
  // Must-show cities pack from top to bottom, so a southern priority winner
  // cannot push a northern card below the whole cluster. Where cards may hide,
  // retain tier priority. Emitter order breaks ties deterministically.
  const contenders = entries
    .map((entry, seq) => ({ entry, seq }))
    .filter(({ entry }) => entry.visible && entry.size)
    .sort((a, b) =>
      cityCardsMustShow && a.entry.city && b.entry.city
        ? a.entry.y - b.entry.y || a.seq - b.seq
        : b.entry.priority - a.entry.priority || a.seq - b.seq,
    )
    .map(({ entry }) => entry);
  for (const entry of contenders) {
    const size = entry.size!;
    let rect = cardRectAt(entry.x, entry.y, size);
    if (cityCardsMustShow && entry.city) {
      // Slide below the claimed ground — other cards AND other cities'
      // anchors (a card over a neighbour's model base buries its marker) —
      // until free. Each step permanently clears at least one obstacle
      // (y only grows), so the obstacle count bounds the loop.
      const anchors = contenders
        .filter((other) => other.city && other !== entry && other.anchor)
        .map((other) => other.anchor!);
      for (let i = 0; i < claimed.length + anchors.length; i++) {
        const rectHits = claimed.filter((other) => rectsOverlap(rect, other));
        const anchorHits = anchors.filter(
          ([x, y]) =>
            x >= rect.x - ANCHOR_CLEAR_PX &&
            x <= rect.x + rect.w + ANCHOR_CLEAR_PX &&
            y >= rect.y - ANCHOR_CLEAR_PX &&
            y <= rect.y + rect.h,
        );
        if (rectHits.length === 0 && anchorHits.length === 0) break;
        entry.y =
          Math.max(
            ...rectHits.map((other) => other.y + other.h),
            ...anchorHits.map(([, y]) => y + ANCHOR_CLEAR_PX),
          ) + CARD_NUDGE_GAP_PX;
        rect = cardRectAt(entry.x, entry.y, size);
      }
      entry.rect = rect;
      claimed.push(rect);
      continue;
    }
    if (!claimed.some((other) => rectsOverlap(rect, other))) {
      entry.rect = rect;
      claimed.push(rect);
      continue;
    }
    entry.visible = false;
    culls.push(`card:${entry.name}`);
  }
  return { culls };
}
