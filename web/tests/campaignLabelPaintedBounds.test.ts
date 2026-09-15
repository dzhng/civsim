import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CampaignLabelFrame,
  type CampaignLabel,
  type CampaignLabelFrameStats,
} from "@packages/game-renderer/src/campaign/labelFrame";
import { rectsOverlap } from "@packages/game-renderer/src/campaign/labelLayout";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";

// The truth this file tests is "what does the label painter actually put on the
// canvas", so the fake 2D context RECORDS every strokeText with the lineWidth in
// force. The painted extent is then derived from those calls (a stroke is
// centred on the glyph outline, so it reaches lineWidth/2 past it) — never from
// the layout module's own inset math, which is the thing under test.
interface StrokeOp {
  text: string;
  /** Left edge of the glyph run, atlas device px. */
  x: number;
  width: number;
  lineWidth: number;
}

let strokes: StrokeOp[] = [];

/** Deterministic monospace-ish metrics: real font metrics are not available in
 * jsdom and the geometry under test only depends on the width the painter
 * measures, not on which width it is. */
const GLYPH_EM = 0.6;

function glyphRunWidth(text: string, font: string) {
  const sizePx = Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);
  return text.length * sizePx * GLYPH_EM;
}

function recordingContext() {
  const ctx = {
    font: "10px serif",
    letterSpacing: "0px",
    lineWidth: 1,
    lineJoin: "round",
    textAlign: "left",
    textBaseline: "alphabetic",
    strokeStyle: "",
    fillStyle: "",
    globalAlpha: 1,
    save() {},
    restore() {},
    clearRect() {},
    translate() {},
    scale() {},
    rotate() {},
    beginPath() {},
    stroke() {},
    fill() {},
    fillText() {},
    measureText(text: string) {
      return { width: glyphRunWidth(text, ctx.font) };
    },
    strokeText(text: string, x: number) {
      strokes.push({ text, x, width: glyphRunWidth(text, ctx.font), lineWidth: ctx.lineWidth });
    },
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { data: new Uint8ClampedArray(w * h * 4) };
    },
  };
  return ctx;
}

const realGetContext = HTMLCanvasElement.prototype.getContext;
const realPath2D = (globalThis as { Path2D?: unknown }).Path2D;

beforeEach(() => {
  strokes = [];
  HTMLCanvasElement.prototype.getContext = (() =>
    recordingContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  (globalThis as { Path2D?: unknown }).Path2D = class {
    constructor(_path: string) {}
  };
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  (globalThis as { Path2D?: unknown }).Path2D = realPath2D;
});

function cityLabel(text: string, importance: number, angle = 0): CampaignLabel {
  return { text, x: 0, y: 0, kind: "city", priority: 3, size: 12, importance, angle, icon: "city" };
}

/** One real frame: the same owner the renderer runs, with the projection
 * supplied so labels land on exact screen pixels. Positions are device px. */
function runFrame(
  labels: CampaignLabel[],
  dpr: number,
  positions: [number, number][],
): CampaignLabelFrameStats {
  const camera = {
    camera3d: chartCamera3d({ x: 0, y: 0, zoom: 2.5 }, 800),
    x: 0,
    y: 0,
    zoom: 2.5,
    width: 1280 * dpr,
    height: 800 * dpr,
  };
  camera.camera3d.aspect = 1280 / 800;
  const at = new Map(labels.map((label, index) => [label, positions[index]]));
  strokes = [];
  return new CampaignLabelFrame().update(labels, camera, dpr, undefined, (label) => at.get(label)!);
}

const CENTER_Y_CSS = 400;

/** Paint a label alone and report where its ink really lands, in CSS px
 * relative to the label's centre, taken from the recorded stroke. */
function paintedSpanCss(text: string, dpr: number, centerXCss: number) {
  const stats = runFrame([cityLabel(text, 1)], dpr, [[centerXCss * dpr, CENTER_Y_CSS * dpr]]);
  const rect = stats.visibleCityLabelRects[0];
  const name = strokes.find((op) => op.text === text)!;
  const boxWidthDevice = rect.box.w * dpr;
  return {
    rect,
    // Local (unrotated) offsets from the box centre: the glyph run, grown by
    // half the halo stroke on each side.
    lo: (name.x - name.lineWidth / 2 - boxWidthDevice / 2) / dpr,
    hi: (name.x + name.width + name.lineWidth / 2 - boxWidthDevice / 2) / dpr,
  };
}

/** The reported bounds must COVER every pixel the painter strokes, and cover
 * little else: the atlas box is rounded up to a whole device pixel, so at most
 * that much dead margin may ride along on an edge. */
function expectCoversPaint(ink: [number, number], paint: [number, number], dpr: number) {
  expect(ink[0]).toBeLessThanOrEqual(paint[0] + 1e-6);
  expect(ink[1]).toBeGreaterThanOrEqual(paint[1] - 1e-6);
  expect(paint[0] - ink[0]).toBeLessThanOrEqual(1 / dpr);
  expect(ink[1] - paint[1]).toBeLessThanOrEqual(1 / dpr);
}

describe("campaign label painted bounds", () => {
  // The reported ink rect IS the rect the occupancy arbitration enforced, so a
  // gap here is a gap in what labels are allowed to do to each other.
  it.each([1, 2])("report the halo the painter strokes, not just the fill (DPR%d)", (dpr) => {
    const span = paintedSpanCss("IULIA CONCORDIA", dpr, 600);

    expectCoversPaint(
      [span.rect.inkRect.x, span.rect.inkRect.x + span.rect.inkRect.w],
      [600 + span.lo, 600 + span.hi],
      dpr,
    );

    // Transparent gutter survives: the box still stands off the paint, so
    // labels do not yield to empty atlas margin.
    expect(span.rect.padPx).toBeGreaterThan(0);
    expect(span.rect.box.x).toBeLessThan(span.rect.inkRect.x);
  });

  it.each([1, 2])("rotate the painted bounds with the quad (DPR%d)", (dpr) => {
    const text = "IULIA CONCORDIA";
    const upright = paintedSpanCss(text, dpr, 600);
    // A quarter turn sends the label's local +x (the glyph run) down the screen,
    // so the same painted span must show up on Y.
    const stats = runFrame([cityLabel(text, 1, Math.PI / 2)], dpr, [
      [600 * dpr, CENTER_Y_CSS * dpr],
    ]);
    const rotated = stats.visibleCityLabelRects[0];

    expectCoversPaint(
      [rotated.inkRect.y, rotated.inkRect.y + rotated.inkRect.h],
      [CENTER_Y_CSS + upright.lo, CENTER_Y_CSS + upright.hi],
      dpr,
    );
  });

  // The main-map defect: two names whose fills clear by ~2px while their halos
  // merge, so the map reads one joined word.
  it.each([1, 2])("hide a neighbour whose halo would touch (DPR%d)", (dpr) => {
    const left = paintedSpanCss("IULIA CONCORDIA", dpr, 600);
    const right = paintedSpanCss("AQUILEIA", dpr, 600);
    // Centre separation at which the two painted spans exactly touch.
    const touching = left.hi - right.lo;

    const merged = runFrame([cityLabel("IULIA CONCORDIA", 9), cityLabel("AQUILEIA", 4)], dpr, [
      [600 * dpr, CENTER_Y_CSS * dpr],
      [(600 + touching - 1) * dpr, CENTER_Y_CSS * dpr],
    ]);
    expect(merged.visibleCityLabelRects.map((rect) => rect.text)).toEqual(["IULIA CONCORDIA"]);
    expect(merged.collisionCulledLabels).toEqual(["city:AQUILEIA"]);

    const clear = runFrame([cityLabel("IULIA CONCORDIA", 9), cityLabel("AQUILEIA", 4)], dpr, [
      [600 * dpr, CENTER_Y_CSS * dpr],
      [(600 + touching + 1) * dpr, CENTER_Y_CSS * dpr],
    ]);
    const [first, second] = clear.visibleCityLabelRects;
    expect(clear.visibleCityLabelRects.map((rect) => rect.text)).toEqual([
      "IULIA CONCORDIA",
      "AQUILEIA",
    ]);
    expect(rectsOverlap(first.inkRect, second.inkRect)).toBe(false);
    // …and they are this close only because the transparent gutters are allowed
    // to overlap. Collide the whole atlas box and this pair would have been cut.
    expect(rectsOverlap(first.box, second.box)).toBe(true);
  });
});
