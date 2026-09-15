import { worldToScreen, type CameraSnapshot } from "@packages/renderer-core/src/cameraUniform";
import type { CampaignLabel } from "@packages/game-renderer/src/campaign/labelFrame";
import type { CampaignMapDrawStyle } from "@packages/game-renderer/src/campaign/roadGeometry";
import {
  SEA_LABEL_ACROSS_NUDGE_KM,
  SEA_LABEL_ALONG_NUDGE_KM,
  SEA_LABEL_FIT_ZOOM,
  SEA_LABEL_LAND_MARGIN_KM,
  SEA_LABEL_LETTER_SPACING_EM,
  SEA_LABEL_MIN_SCALE,
  SEA_LABEL_NUDGE_STEP_KM,
  SEA_LABEL_PADDING_EM,
  SEA_LABEL_SAMPLE_STEP_KM,
  SEA_LABEL_SHRINK_STEP,
} from "@packages/game-renderer/src/campaign/seaLabels";
import { clamp01 } from "../../../renderer-core/src/math";

const ICON_PATHS = {
  city: "M240,208H224V136l2.34,2.34A8,8,0,0,0,237.66,127L139.31,28.68a16,16,0,0,0-22.62,0L18.34,127a8,8,0,0,0,11.32,11.31L32,136v72H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16Zm-88,0H104V160a4,4,0,0,1,4-4h40a4,4,0,0,1,4,4Z",
  army: "M230.4,219.19A8,8,0,0,1,224,232H32a8,8,0,0,1-6.4-12.8A67.88,67.88,0,0,1,53,197.51a40,40,0,1,1,53.93,0,67.42,67.42,0,0,1,21,14.29,67.42,67.42,0,0,1,21-14.29,40,40,0,1,1,53.93,0A67.85,67.85,0,0,1,230.4,219.19ZM27.2,126.4a8,8,0,0,0,11.2-1.6,52,52,0,0,1,83.2,0,8,8,0,0,0,12.8,0,52,52,0,0,1,83.2,0,8,8,0,0,0,12.8-9.61A67.85,67.85,0,0,0,203,93.51a40,40,0,1,0-53.93,0,67.42,67.42,0,0,0-21,14.29,67.42,67.42,0,0,0-21-14.29,40,40,0,1,0-53.93,0A67.88,67.88,0,0,0,25.6,115.2,8,8,0,0,0,27.2,126.4Z",
  sword:
    "M202.7,17.4l35.9,35.9L104,187.9l-35.9-35.9L202.7,17.4ZM57.5,135.6l62.9,62.9-18.1,18.1-18.7-18.7-41.9,41.9-25.5-25.5 41.9-41.9-18.7-18.7 18.1-18.1Z",
} as const;

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The one overlap implementation: every collision verdict — label vs label,
 * card vs label, card vs card in the scene loop — goes through this test, so
 * "overlaps" means the same thing on both sides of the canvas/DOM seam. */
export function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The land truth city-label anchor choice samples: the full-res render mask
 * (TerrainField.renderLandAt) — the same owner the sea-label fitter scores
 * against. Absent the style, the occupancy arbitration still runs (with no
 * card blockers) but candidates are not water-scored: the first
 * occupancy-clear candidate wins. */
export interface CampaignLabelPlacementStyle {
  renderSurfaceAt: (x: number, y: number) => "land" | "water";
  /** Visible DOM card rects (CSS px), reported per frame by the scene's card
   * loop. Cards outrank canvas labels: the occupancy arbitration treats these
   * as pre-claimed ground. */
  blockedRects?: ScreenRect[];
}

export interface CampaignLabelDebugRect {
  text: string;
  kind: CampaignLabel["kind"];
  importance?: number;
  opacity: number;
  box: { x: number; y: number; w: number; h: number };
  corners: [number, number][];
  /** Transparent halo margin inside the box, CSS px per side. Deflating the
   * box by this gives the ink rect (icon + glyphs) — the visible label. */
  padPx: number;
  /** The exact ink-rect AABB the occupancy arbitration used for this label
   * (deflate-to-ink THEN rotate THEN AABB). For a tilted label this is tighter
   * than deflating `box` (the full-quad AABB) by `padPx` — consumers checking
   * overlaps must use this so the test agrees with what arbitration enforced. */
  inkRect: { x: number; y: number; w: number; h: number };
  /** Icon-above city labels only: the drawn settlement-icon sub-rect in
   * CSS px (the marker footprint). Absent for labels with no above-icon. */
  iconRect?: { x: number; y: number; w: number; h: number };
  /** Faction labels only: true for the small league names (they yield to
   * cards; major engravings are background-scale and do not). */
  minor?: boolean;
}

/** Per-sea-label fit verdict: the accepted scale, how far the label moved
 * from its authored anchor, and the land fraction of the accepted placement's
 * sample cloud (0 = fully on water at the fit zoom). */
export interface CampaignSeaLabelFit {
  text: string;
  scale: number;
  nudgeKm: number;
  landFraction: number;
}

/** The one placement scorer (shared with city-label anchoring): walk
 * preference-ordered candidates, sample each one's world-space point cloud,
 * and return the first fully-clean candidate — else the least-bad earliest
 * one. "Bad" is the caller's polarity: land under a sea label, water under a
 * city label. */
interface PlacementVerdict<C> {
  candidate: C;
  badFraction: number;
}

function bestPlacement<C>(
  candidates: Iterable<C>,
  worldSamplesOf: (candidate: C) => [number, number][],
  isBadAt: (x: number, y: number) => boolean,
): PlacementVerdict<C> | null {
  let best: PlacementVerdict<C> | null = null;
  for (const candidate of candidates) {
    const samples = worldSamplesOf(candidate);
    if (samples.length === 0) continue;
    // A candidate is dead once it cannot beat the incumbent; bail early so
    // mostly-bad candidates cost a handful of lookups, not the full grid.
    const badLimit = best ? best.badFraction * samples.length : samples.length;
    let bad = 0;
    for (const [x, y] of samples) {
      if (isBadAt(x, y)) {
        bad++;
        if (bad >= badLimit) break;
      }
    }
    const badFraction = bad / samples.length;
    if (badFraction === 0) return { candidate, badFraction };
    if (!best || badFraction < best.badFraction - 1e-6) best = { candidate, badFraction };
  }
  return best;
}

interface SeaLabelPlacement {
  x: number;
  y: number;
  scale: number;
  nudgeKm: number;
}

interface FittedSeaLabels {
  labels: CampaignLabel[];
  fits: CampaignSeaLabelFit[];
  fitZoom: number;
}

function surfaceAt(style: CampaignMapDrawStyle) {
  return style.surfaceAt ?? style.roadSurfaceAt;
}

export function fitSeaLabels(
  labels: CampaignLabel[],
  style: CampaignMapDrawStyle,
): FittedSeaLabels {
  const fitZoom = Math.min(style.seaLabelFitZoom ?? SEA_LABEL_FIT_ZOOM, SEA_LABEL_FIT_ZOOM);
  const at = style.renderSurfaceAt ?? surfaceAt(style);
  if (!at) return { labels, fits: [], fitZoom };
  const widthOf = seaLabelWidthMeasurer();
  const fitted: CampaignLabel[] = [];
  const fits: CampaignSeaLabelFit[] = [];
  for (const label of labels) {
    const verdict = bestPlacement(
      seaLabelCandidates(label),
      (candidate) => seaLabelWorldSamples(label, candidate, fitZoom, widthOf),
      (x, y) => at(x, y) === "land",
    );
    const placement = verdict?.candidate ?? { x: label.x, y: label.y, scale: 1, nudgeKm: 0 };
    fitted.push({
      ...label,
      x: placement.x,
      y: placement.y,
      size: label.size * placement.scale,
    });
    fits.push({
      text: labelText(label),
      scale: placement.scale,
      nudgeKm: roundPx(placement.nudgeKm),
      landFraction: roundPx(verdict?.badFraction ?? 0),
    });
  }
  return { labels: fitted, fits, fitZoom };
}

/** Move before shrink: every nudge along the sea's axis at full size comes
 * before the first shrink step, and each shrink re-runs the whole sweep.
 * label.angle rotates the drawn quad in screen space (y down); world y runs
 * up, so the screen baseline direction (cos a, sin a) is (cos a, -sin a) in
 * world km. */
function* seaLabelCandidates(label: CampaignLabel): Generator<SeaLabelPlacement> {
  const angle = label.angle ?? 0;
  const along: [number, number] = [Math.cos(angle), -Math.sin(angle)];
  const across: [number, number] = [-Math.sin(angle), -Math.cos(angle)];
  for (let scale = 1; scale >= SEA_LABEL_MIN_SCALE - 0.001; scale -= SEA_LABEL_SHRINK_STEP) {
    for (const [u, v] of seaLabelNudges()) {
      yield {
        x: label.x + along[0] * u + across[0] * v,
        y: label.y + along[1] * u + across[1] * v,
        scale,
        nudgeKm: Math.hypot(u, v),
      };
    }
  }
}

/** Nudge offsets (along, across) ordered by distance so the scorer prefers
 * placements near the authored anchor. Each axis steps outward from 0 so
 * pure along-axis and pure across-axis moves are always in the grid. */
function seaLabelNudges(): [number, number][] {
  const axisSteps = (budgetKm: number) => {
    const steps = [0];
    for (let d = SEA_LABEL_NUDGE_STEP_KM; d <= budgetKm; d += SEA_LABEL_NUDGE_STEP_KM) {
      steps.push(d, -d);
    }
    return steps;
  };
  const nudges: [number, number][] = [];
  for (const u of axisSteps(SEA_LABEL_ALONG_NUDGE_KM)) {
    for (const v of axisSteps(SEA_LABEL_ACROSS_NUDGE_KM)) {
      nudges.push([u, v]);
    }
  }
  return nudges.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
}

/** Sample grid over the label's full drawn rect — the same box the atlas
 * lays out (measured text width, curve depth, padding), inflated by the land
 * margin. Local coordinates are the quad's screen space (y down); the final
 * y flip converts screen-down to world-north. Matching the drawn rect (not
 * just the glyph band) keeps the fit verdict equal to what an area probe of
 * the rendered box measures. */
function seaLabelWorldSamples(
  label: CampaignLabel,
  placement: SeaLabelPlacement,
  fitZoom: number,
  widthOf: (text: string, sizePx: number) => number,
): [number, number][] {
  const text = labelText(label);
  const sizePx = Math.max(10, label.size * placement.scale);
  const widthPx = widthOf(text, sizePx);
  const depthPx = seaLabelCurveDepthPx(label, sizePx, widthPx);
  const paddingPx = Math.ceil(sizePx * SEA_LABEL_PADDING_EM);
  const boxWidthPx = widthPx + paddingPx * 2;
  const boxHeightPx = sizePx * 1.5 + Math.abs(depthPx) * 1.35 + paddingPx * 2;
  const halfWidthKm = (boxWidthPx * 0.5) / fitZoom + SEA_LABEL_LAND_MARGIN_KM;
  const halfHeightKm = (boxHeightPx * 0.5) / fitZoom + SEA_LABEL_LAND_MARGIN_KM;
  const angle = label.angle ?? 0;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  // Island-scale sampling: Aegean islets are ~15-30 km, so a coarser grid
  // certifies "clean" placements whose drawn box still clips an island.
  const cols = Math.max(12, Math.ceil((halfWidthKm * 2) / SEA_LABEL_SAMPLE_STEP_KM));
  const rows = Math.max(5, Math.ceil((halfHeightKm * 2) / SEA_LABEL_SAMPLE_STEP_KM));
  const samples: [number, number][] = [];
  for (let iy = 0; iy < rows; iy++) {
    const py = -halfHeightKm + (2 * halfHeightKm * iy) / (rows - 1);
    for (let ix = 0; ix < cols; ix++) {
      const px = -halfWidthKm + (2 * halfWidthKm * ix) / (cols - 1);
      samples.push([placement.x + px * ca - py * sa, placement.y - (px * sa + py * ca)]);
    }
  }
  return samples;
}

/** True atlas measure: the same per-glyph measurement the atlas draw uses
 * (measureSeaLabelGlyphs), at dpr 1. Falls back to the coarse per-class
 * estimate where no canvas exists (node-side use). */
function seaLabelWidthMeasurer(): (text: string, sizePx: number) => number {
  const ctx =
    typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!ctx) return estimatedSeaLabelWidthPx;
  return (text, sizePx) => {
    ctx.font = seaLabelFont(sizePx);
    return measureSeaLabelGlyphs(ctx, sizePx, text).width;
  };
}

function estimatedSeaLabelWidthPx(text: string, sizePx: number) {
  const glyphWidthsPx = Array.from(text).map((char) => seaGlyphWidthPx(char, sizePx));
  return Math.max(
    1,
    glyphWidthsPx.reduce((sum, value) => sum + value, 0) +
      Math.max(0, glyphWidthsPx.length - 1) * sizePx * SEA_LABEL_LETTER_SPACING_EM,
  );
}

function seaGlyphWidthPx(char: string, sizePx: number) {
  if (char === " ") return sizePx * 0.34;
  if ("ilI.,".includes(char)) return sizePx * 0.28;
  if ("MW".includes(char)) return sizePx * 0.94;
  if (char === char.toUpperCase() && char !== char.toLowerCase()) return sizePx * 0.72;
  return sizePx * 0.58;
}

interface VisibleCampaignLabel {
  label: CampaignLabel;
  screenX: number;
  screenY: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

interface AtlasEntry extends VisibleCampaignLabel {
  width: number;
  height: number;
  padding: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface MeasuredCampaignLabel extends VisibleCampaignLabel {
  text: string;
  sideText: string;
  subText: string;
  style: ReturnType<typeof labelStyle>;
  seaPath: SeaLabelPath | null;
  mainWidth: number;
  width: number;
  height: number;
}

// League-name density: at overview only leagues whose owned-city power clears
// this bar keep a name (majors always clear it); the bar falls to zero as the
// camera comes in. Tuned so the whole-map view shows the handful of strong
// leagues, not a wall of minor ones. Faction engravings retire (hide, not fade —
// no opacity) once the camera is close enough that city labels carry the detail.
const LEAGUE_IMPORTANCE_BAR_HI = 14;
const FACTION_RETIRE_ZOOM = 0.95;

/** Device-pixel projection; null means behind the camera. */
export type CampaignLabelProjection = (label: CampaignLabel) => [number, number] | null;

export function visibleLabels(
  labels: CampaignLabel[],
  camera: CameraSnapshot,
  dpr: number,
  project?: CampaignLabelProjection,
): VisibleCampaignLabel[] {
  const visible: VisibleCampaignLabel[] = [];
  for (const label of labels) {
    let opacity = 1;
    let resolved = label;
    if (label.kind === "city") {
      const minTier = camera.zoom < 0.6 ? 3 : camera.zoom < 0.85 ? 2 : 1;
      if (label.priority < minTier) continue;
      const size = Math.min(15, 9.5 + camera.zoom) * (label.priority >= 3 ? 1.15 : 1);
      resolved = { ...label, size };
    } else if (label.kind === "army") {
      if (camera.zoom <= 0.35) continue;
      const size = Math.min(14, 9 + camera.zoom);
      resolved = { ...label, size };
    } else if (label.kind === "sea") {
      opacity = (1 - clamp01((camera.zoom - 0.26) / 0.16)) * 0.8;
      if (opacity <= 0.02) continue;
    } else if (label.kind === "faction") {
      // Faction/league names are SOLID — no opacity anywhere (only sea names
      // fade). Density is by VISIBILITY, not transparency: an engraving is shown
      // at full strength or not at all. Retire engravings at close zoom, where
      // the city labels carry the detail view.
      if (camera.zoom > FACTION_RETIRE_ZOOM) continue;
      if (label.factionMinor) {
        // Leagues declutter by owned-city power (not territory area): a league
        // keeps its name once its power clears the zoom-scaled bar — high at
        // overview so only the strong leagues show, falling as the camera comes
        // in (where the tighter viewport already thins the count) — else hidden.
        const bar = LEAGUE_IMPORTANCE_BAR_HI * (1 - clamp01((camera.zoom - 0.3) / 0.5));
        if ((label.importance ?? 0) < bar) continue;
      }
      const radius = label.factionRadiusKm ?? 0;
      const screenR = radius * camera.zoom;
      const size = label.factionMinor
        ? Math.min(22, Math.max(9, screenR * 0.4))
        : Math.min(34, Math.max(17, screenR * 0.5));
      resolved = { ...label, size };
    }
    const anchor = project ? project(label) : worldToScreen(camera, label.x, label.y);
    if (!anchor) continue;
    const [screenX, screenY] = anchor;
    if (
      screenX < -180 ||
      screenY < -80 ||
      screenX > camera.width + 180 ||
      screenY > camera.height + 80
    )
      continue;
    visible.push({
      label: resolved,
      screenX,
      screenY,
      offsetX: (label.screenOffsetX ?? 0) * dpr,
      offsetY: (label.screenOffsetY ?? 0) * dpr,
      opacity,
    });
  }
  return visible;
}

export function blockedRectsKey(placement: CampaignLabelPlacementStyle | undefined) {
  return (placement?.blockedRects ?? [])
    .map((rect) => [rect.x, rect.y, rect.w, rect.h].map((v) => v.toFixed(1)).join(","))
    .join(";");
}

export function labelAtlasKey(labels: VisibleCampaignLabel[], dpr: number, totalLabels: number) {
  return [
    totalLabels,
    dpr.toFixed(2),
    ...labels.map((entry) => {
      const { label } = entry;
      return [
        label.kind,
        labelText(label),
        label.x.toFixed(2),
        label.y.toFixed(2),
        label.size.toFixed(2),
        label.priority,
        (label.angle ?? 0).toFixed(3),
        (label.curve ?? 0).toFixed(3),
        label.icon ?? "none",
        label.iconColor?.map((v) => v.toFixed(3)).join(",") ?? "",
        label.rightIcon ?? "none",
        label.rightIconColor?.map((v) => v.toFixed(3)).join(",") ?? "",
        label.sideText ?? "",
        label.subText ?? "",
        label.collisionGroup ?? "",
        entry.offsetX.toFixed(2),
        entry.offsetY.toFixed(2),
        label.screenAnchorX ?? "center",
        label.screenAnchorY ?? "center",
        entry.opacity.toFixed(3),
        entry.screenX.toFixed(1),
        entry.screenY.toFixed(1),
      ].join(":");
    }),
  ].join("|");
}

export function buildLabelAtlas(
  labels: VisibleCampaignLabel[],
  dpr: number,
  camera: CameraSnapshot,
  placement?: CampaignLabelPlacementStyle,
) {
  const measure = document.createElement("canvas").getContext("2d")!;
  const measured = labels.map((entry): MeasuredCampaignLabel => {
    const style = labelStyle(entry.label, dpr);
    measure.font = style.font;
    measure.letterSpacing = style.letterSpacing;
    const text = labelText(entry.label);
    const sideText = entry.label.sideText ?? "";
    const subText = entry.label.subText ?? "";
    // A city label wears its settlement icon ABOVE the name (the icon is the
    // city's marker), so it sits on the city with the name beneath it. Every
    // other label keeps its icon to the left of the text.
    const iconAbove = entry.label.kind === "city" && !!entry.label.icon;
    const iconWidth = entry.label.icon && !iconAbove ? style.iconSize + style.iconGap : 0;
    const rightIconWidth = entry.label.rightIcon ? style.iconSize + style.iconGap : 0;
    const mainWidth = measure.measureText(text).width;
    const sideWidth = sideText
      ? style.sideGap + measureTextWithFont(measure, style.sideFont, style.letterSpacing, sideText)
      : 0;
    const subWidth = subText
      ? measureTextWithFont(measure, style.subFont, style.letterSpacing, subText)
      : 0;
    const seaPath =
      entry.label.kind === "sea" ? measureSeaLabel(measure, style, entry.label, text) : null;
    const rowWidth = mainWidth + iconWidth + sideWidth + rightIconWidth;
    return {
      ...entry,
      text,
      sideText,
      subText,
      style,
      seaPath,
      mainWidth,
      width: iconAbove
        ? Math.max(
            1,
            Math.ceil(Math.max(mainWidth + rightIconWidth, style.iconSize) + style.padding * 2),
          )
        : Math.max(
            1,
            Math.ceil(Math.max(seaPath?.width ?? rowWidth, subWidth) + style.padding * 2),
          ),
      height: iconAbove
        ? Math.max(
            1,
            Math.ceil(style.iconSize + style.iconGap + style.size * 1.55 + style.padding * 2),
          )
        : Math.max(
            1,
            Math.ceil(
              (seaPath?.height ?? style.size * (subText ? 2.42 : 1.55)) + style.padding * 2,
            ),
          ),
    };
  });
  const collision = arbitrateLabelOccupancy(measured, dpr, placement);
  const layoutEntries = collision.entries;
  const atlasWidth = measured.some((entry) => entry.width > 1024) ? 2048 : 1024;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const placements: (MeasuredCampaignLabel & { x: number; y: number })[] = [];
  for (const entry of layoutEntries) {
    if (x + entry.width > atlasWidth) {
      x = 0;
      y += rowHeight + 2;
      rowHeight = 0;
    }
    placements.push({ ...entry, x, y });
    x += entry.width + 2;
    rowHeight = Math.max(rowHeight, entry.height);
  }
  const atlasHeight = Math.max(32, nextPowerOfTwo(y + rowHeight + 2));
  const canvas = document.createElement("canvas");
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const entries: AtlasEntry[] = [];
  for (const entry of placements) {
    ctx.save();
    ctx.font = entry.style.font;
    ctx.letterSpacing = entry.style.letterSpacing;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    const iconAbove = entry.label.kind === "city" && !!entry.label.icon;
    const iconWidth =
      entry.label.icon && !iconAbove ? entry.style.iconSize + entry.style.iconGap : 0;
    // Icon-above city labels center their name under the settlement icon; every
    // other label draws its text on a single baseline after the left icon.
    const tx = iconAbove
      ? entry.x + entry.width * 0.5 - entry.mainWidth * 0.5
      : entry.x + entry.style.padding + iconWidth;
    const ty = iconAbove
      ? entry.y +
        entry.style.padding +
        entry.style.iconSize +
        entry.style.iconGap +
        entry.style.size
      : entry.y + entry.style.padding + entry.style.size;
    ctx.globalAlpha = entry.opacity;
    if (entry.label.kind === "sea" && entry.seaPath) {
      drawSeaLabelText(ctx, entry, entry.seaPath);
    } else {
      if (iconAbove) {
        drawLabelIcon(
          ctx,
          entry.label,
          entry.x + entry.width * 0.5 - entry.style.iconSize * 0.5,
          entry.y + entry.style.padding,
          entry.style,
        );
      } else if (entry.label.icon) {
        drawLabelIcon(
          ctx,
          entry.label,
          entry.x + entry.style.padding,
          ty - entry.style.iconSize * 0.84,
          entry.style,
        );
      }
      ctx.lineWidth = entry.style.haloWidth;
      ctx.strokeStyle = entry.style.halo;
      ctx.strokeText(entry.text, tx, ty);
      ctx.fillStyle = entry.style.fill;
      ctx.fillText(entry.text, tx, ty);
      if (entry.sideText) {
        const sx = tx + entry.mainWidth + entry.style.sideGap;
        ctx.font = entry.style.sideFont;
        ctx.lineWidth = entry.style.sideHaloWidth;
        ctx.strokeStyle = entry.style.halo;
        ctx.strokeText(entry.sideText, sx, ty);
        ctx.fillStyle = entry.style.sideFill;
        ctx.fillText(entry.sideText, sx, ty);
        ctx.font = entry.style.font;
      }
      if (entry.label.rightIcon) {
        const sideWidth = entry.sideText
          ? entry.style.sideGap +
            measureTextWithFont(
              ctx,
              entry.style.sideFont,
              entry.style.letterSpacing,
              entry.sideText,
            )
          : 0;
        const ix = tx + entry.mainWidth + sideWidth + entry.style.iconGap;
        drawLabelIcon(
          ctx,
          { ...entry.label, icon: entry.label.rightIcon, iconColor: entry.label.rightIconColor },
          ix,
          ty - entry.style.iconSize * 0.84,
          entry.style,
        );
      }
    }
    if (entry.subText) {
      ctx.font = entry.style.subFont;
      const subWidth = ctx.measureText(entry.subText).width;
      const sx = entry.x + entry.width * 0.5 - subWidth * 0.5;
      const sy = ty + entry.style.subBaselineOffset;
      ctx.lineWidth = entry.style.subHaloWidth;
      ctx.strokeStyle = entry.style.halo;
      ctx.strokeText(entry.subText, sx, sy);
      ctx.fillStyle = entry.style.subFill;
      ctx.fillText(entry.subText, sx, sy);
    }
    ctx.restore();
    entries.push({
      label: entry.label,
      screenX: entry.screenX,
      screenY: entry.screenY,
      offsetX: entry.offsetX,
      offsetY: entry.offsetY,
      opacity: entry.opacity,
      width: entry.width,
      height: entry.height,
      padding: entry.style.padding,
      u0: entry.x / atlasWidth,
      v0: entry.y / atlasHeight,
      u1: (entry.x + entry.width) / atlasWidth,
      v1: (entry.y + entry.height) / atlasHeight,
    });
  }
  return {
    width: atlasWidth,
    height: atlasHeight,
    pixels: ctx.getImageData(0, 0, atlasWidth, atlasHeight).data,
    entries,
    collisionCulls: collision.culledLabels.length,
    collisionCulledLabels: collision.culledLabels.slice(0, 64),
  };
}

// A fading label is a ghost, not readable ink: below this opacity it draws but
// neither claims occupancy nor culls against anyone (labels pop less through
// their fade bands than if a near-invisible engraving could hide a city name).
const OCCUPANCY_MIN_OPACITY = 0.3;

/** One claimed patch of screen. Card claims are marked so territory-scale
 * faction engravings can ignore them (see arbitrateLabelOccupancy). */
interface OccupancyClaim {
  rect: ScreenRect;
  card: boolean;
}

/** The one occupancy authority ensures nothing readable overlaps.
 *
 * Claim order is the who-yields priority, deterministic:
 *   1. DOM cards (reported by the scene loop) — pre-claimed; cards outrank
 *      canvas labels.
 *   2. Faction engravings (major): claim their ink against same-scale text but
 *      neither yield to nor contest cards — a small chip over a giant
 *      background engraving reads fine, hiding a nation's name would not
 *      (the same reasoning that keeps sea names out entirely).
 *   3. Minor faction (league) names — label-scale text, so they yield to
 *      cards and earlier claims.
 *   4. Army labels — fixed anchors on moving stacks; they yield by hiding
 *      (the marker stays).
 *   5. City labels, higher tier first — the only movable text: each dodges
 *      through its placement candidates (occupancy-clear first, then the
 *      shared land scorer) and hides only when every candidate is claimed.
 * Sea labels stay out of the game on both sides: basin-scale background text.
 * A surviving composed garrison label still replaces its city's plain label
 * by collision group; a composed label that loses its ground frees the city
 * label to arbitrate normally.
 */
function arbitrateLabelOccupancy(
  labels: MeasuredCampaignLabel[],
  dpr: number,
  placement: CampaignLabelPlacementStyle | undefined,
) {
  const claims: OccupancyClaim[] = (placement?.blockedRects ?? []).map((rect) => ({
    rect,
    card: true,
  }));
  const overlapsClaim = (rect: ScreenRect, ignoreCards: boolean) =>
    claims.some((claim) => !(ignoreCards && claim.card) && rectsOverlap(rect, claim.rect));

  const arbitrates = (entry: MeasuredCampaignLabel) =>
    entry.label.kind !== "sea" && entry.opacity >= OCCUPANCY_MIN_OPACITY;
  // One occupancy budget for every kind: the label with the higher importance
  // claims its space first, the rest cull when they collide. Importance is the
  // unified scalar the emitters assemble (owned-city-tier power for factions,
  // tier for cities, soldier mass for armies) — so a strong realm or a great
  // city leads and a minor league yields, with no per-kind stage ladder.
  const importanceOf = (entry: MeasuredCampaignLabel) => entry.label.importance ?? 0;
  const ordered = labels
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => arbitrates(entry))
    .sort((a, b) => {
      const byImportance = importanceOf(b.entry) - importanceOf(a.entry);
      if (byImportance !== 0) return byImportance;
      return a.index - b.index;
    });

  const culled = new Set<MeasuredCampaignLabel>();
  const culledLabels: string[] = [];
  const cull = (entry: MeasuredCampaignLabel) => {
    culled.add(entry);
    culledLabels.push(`${entry.label.kind}:${labelText(entry.label)}`);
  };
  const composedArmyGroups = new Set<string>();

  for (const { entry } of ordered) {
    const kind = entry.label.kind;
    if (kind === "faction" && !entry.label.factionMinor) {
      const rect = entryInkRect(entry, dpr);
      if (overlapsClaim(rect, true)) {
        cull(entry);
        continue;
      }
      claims.push({ rect, card: false });
      continue;
    }
    if (kind === "city") {
      const group = entry.label.collisionGroup;
      if (group !== undefined && composedArmyGroups.has(group)) {
        cull(entry);
        continue;
      }
      const rect = placeCityLabel(entry, claims, dpr);
      if (!rect) {
        cull(entry);
        continue;
      }
      claims.push({ rect, card: false });
      continue;
    }
    const rect = entryInkRect(entry, dpr);
    if (overlapsClaim(rect, false)) {
      cull(entry);
      continue;
    }
    claims.push({ rect, card: false });
    const group = entry.label.collisionGroup;
    if (kind === "army" && entry.label.subText && group !== undefined) {
      composedArmyGroups.add(group);
    }
  }
  return {
    entries: labels.filter((entry) => !culled.has(entry)),
    culledLabels,
  };
}

/** A city label has one marker
 * hug position. If that ink rect is already claimed, the label hides rather
 * than dodging to another side. */
function placeCityLabel(
  entry: MeasuredCampaignLabel,
  claims: OccupancyClaim[],
  dpr: number,
): ScreenRect | null {
  const rect = entryInkRect(entry, dpr);
  return claims.some((claim) => rectsOverlap(rect, claim.rect)) ? null : rect;
}

/** Ink rect (CSS px AABB) of a measured label at its current anchor. */
function entryInkRect(entry: MeasuredCampaignLabel, dpr: number): ScreenRect {
  return inkRectAt(
    entry,
    entry.offsetX,
    entry.offsetY,
    entry.label.screenAnchorX,
    entry.label.screenAnchorY,
    dpr,
  );
}

/** The visible ink box: the atlas rect deflated by its transparent halo
 * padding, placed with the same anchor math the GPU quad uses (the padding is
 * margin nobody sees — counting it would make labels yield to empty air). */
function inkRectAt(
  entry: MeasuredCampaignLabel,
  offsetX: number,
  offsetY: number,
  anchorX: CampaignLabel["screenAnchorX"],
  anchorY: CampaignLabel["screenAnchorY"],
  dpr: number,
): ScreenRect {
  const pad = entry.style.padding;
  const corners = labelCornersCss(
    entry.screenX + anchorCenterOffsetX(anchorX, offsetX, entry.width),
    entry.screenY + anchorCenterOffsetY(anchorY, offsetY, entry.height),
    Math.max(1, entry.width - pad * 2),
    Math.max(1, entry.height - pad * 2),
    entry.label.angle ?? 0,
    dpr,
  );
  return cornersAabb(corners);
}

/** Screen offset from the label's anchor point to its rect center: a 'left'
 * X-anchor means the rect's left edge sits at anchor+offset, so the center is
 * half a width further, and symmetrically for the other anchors. */
function anchorCenterOffsetX(
  anchor: CampaignLabel["screenAnchorX"],
  offsetX: number,
  width: number,
) {
  if (anchor === "left") return offsetX + width * 0.5;
  if (anchor === "right") return offsetX - width * 0.5;
  return offsetX;
}

function anchorCenterOffsetY(
  anchor: CampaignLabel["screenAnchorY"],
  offsetY: number,
  height: number,
) {
  if (anchor === "top") return offsetY + height * 0.5;
  if (anchor === "bottom") return offsetY - height * 0.5;
  return offsetY;
}

/** Corners (CSS px) of a label quad of the given size centered at the given
 * device-px screen center, rotated like the GPU quad. Shared by the occupancy
 * arbitration and the debug rects — one corner math. */
function labelCornersCss(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  angle: number,
  dpr: number,
): [number, number][] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [-width * 0.5, -height * 0.5],
    [width * 0.5, -height * 0.5],
    [width * 0.5, height * 0.5],
    [-width * 0.5, height * 0.5],
  ].map(([x, y]): [number, number] => [
    roundPx((centerX + x * c - y * s) / dpr),
    roundPx((centerY + x * s + y * c) / dpr),
  ]);
}

function cornersAabb(corners: [number, number][]): ScreenRect {
  const xs = corners.map((corner) => corner[0]);
  const ys = corners.map((corner) => corner[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return {
    x: roundPx(x0),
    y: roundPx(y0),
    w: roundPx(Math.max(...xs) - x0),
    h: roundPx(Math.max(...ys) - y0),
  };
}

export function labelDebugRects(entries: AtlasEntry[], dpr: number): CampaignLabelDebugRect[] {
  return entries.map((entry) => {
    const label = entry.label;
    const centerX =
      entry.screenX + anchorCenterOffsetX(label.screenAnchorX, entry.offsetX, entry.width);
    const centerY =
      entry.screenY + anchorCenterOffsetY(label.screenAnchorY, entry.offsetY, entry.height);
    const angle = label.angle ?? 0;
    const corners = labelCornersCss(centerX, centerY, entry.width, entry.height, angle, dpr);
    // Ink rect the arbitration enforced: deflate to ink, THEN rotate, THEN AABB
    // (mirrors inkRectAt). For a tilted label this differs from deflating the
    // full-quad AABB `box`.
    const inkCorners = labelCornersCss(
      centerX,
      centerY,
      Math.max(1, entry.width - entry.padding * 2),
      Math.max(1, entry.height - entry.padding * 2),
      angle,
      dpr,
    );
    const iconAbove = label.kind === "city" && !!label.icon;
    const iconSize = iconAbove ? labelStyle(label, dpr).iconSize : 0;
    const iconRect = iconAbove
      ? cornersAabb(
          labelCornersCss(
            centerX,
            centerY - entry.height * 0.5 + entry.padding + iconSize * 0.5,
            iconSize,
            iconSize,
            angle,
            dpr,
          ),
        )
      : undefined;
    return {
      text: labelText(label),
      kind: label.kind,
      importance: label.importance,
      opacity: roundPx(entry.opacity),
      box: cornersAabb(corners),
      corners,
      padPx: roundPx(entry.padding / dpr),
      inkRect: cornersAabb(inkCorners),
      ...(iconRect ? { iconRect } : {}),
      ...(label.kind === "faction" ? { minor: label.factionMinor === true } : {}),
    };
  });
}

function roundPx(value: number) {
  return Number(value.toFixed(3));
}

export function buildLabelVertices(entries: AtlasEntry[], screenAnchors = false) {
  const vertices = new Float32Array(entries.length * 6 * 6);
  let o = 0;
  for (const entry of entries) {
    const label = entry.label;
    const width = entry.width;
    const height = entry.height;
    const angle = label.angle ?? 0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const anchorOffsetX = anchorCenterOffsetX(label.screenAnchorX, entry.offsetX, width);
    const anchorOffsetY = anchorCenterOffsetY(label.screenAnchorY, entry.offsetY, height);
    const corners = [
      [-width * 0.5, -height * 0.5, entry.u0, entry.v0],
      [width * 0.5, -height * 0.5, entry.u1, entry.v0],
      [-width * 0.5, height * 0.5, entry.u0, entry.v1],
      [width * 0.5, -height * 0.5, entry.u1, entry.v0],
      [width * 0.5, height * 0.5, entry.u1, entry.v1],
      [-width * 0.5, height * 0.5, entry.u0, entry.v1],
    ];
    for (const corner of corners) {
      const [x, y, u, v] = corner;
      const ox = x * c - y * s;
      const oy = x * s + y * c;
      vertices[o++] = screenAnchors ? entry.screenX : label.x;
      vertices[o++] = screenAnchors ? entry.screenY : label.y;
      vertices[o++] = ox + anchorOffsetX;
      vertices[o++] = oy + anchorOffsetY;
      vertices[o++] = u;
      vertices[o++] = v;
    }
  }
  return vertices;
}

export function labelText(label: CampaignLabel) {
  return label.kind === "faction" || label.kind === "sea" ? label.text.toUpperCase() : label.text;
}

function labelStyle(label: CampaignLabel, dpr: number) {
  const size = Math.max(10, label.size) * dpr;
  if (label.kind === "sea") {
    return {
      font: seaLabelFont(size),
      letterSpacing: `${size * SEA_LABEL_LETTER_SPACING_EM}px`,
      size,
      padding: Math.ceil(size * SEA_LABEL_PADDING_EM),
      fill: "rgba(196, 214, 232, 0.78)",
      halo: "rgba(20, 34, 52, 0.55)",
      haloWidth: 2.5 * dpr,
      iconSize: 0,
      iconGap: 0,
      iconHaloWidth: 0,
      sideFont: `400 ${size * 0.7}px Georgia, 'Times New Roman', serif`,
      sideFill: "rgba(196,214,232,0.72)",
      sideGap: size * 0.25,
      sideHaloWidth: 1.6 * dpr,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: "rgba(232,224,208,0.92)",
      subHaloWidth: 2 * dpr,
      subBaselineOffset: size * 0.98,
    };
  }
  if (label.kind === "army") {
    return {
      font: `600 ${size}px Cinzel, Georgia, 'Times New Roman', serif`,
      letterSpacing: `${0.5 * dpr}px`,
      size,
      padding: Math.ceil(size * 0.42),
      fill: "rgba(248,244,237,0.98)",
      halo: "rgba(14,10,7,0.88)",
      haloWidth: 3.1 * dpr,
      iconSize: size * 1.25,
      iconGap: size * 0.32,
      iconHaloWidth: 30,
      sideFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      sideFill: "rgba(238,232,218,0.95)",
      sideGap: size * 0.42,
      sideHaloWidth: 2.4 * dpr,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: "rgba(248,244,237,0.96)",
      subHaloWidth: 2.7 * dpr,
      subBaselineOffset: size * 1.14,
    };
  }
  if (label.kind === "faction") {
    return {
      font: `700 ${size}px Cinzel, Georgia, 'Times New Roman', serif`,
      letterSpacing: `${Math.max(0.5 * dpr, size * 0.07)}px`,
      size,
      padding: Math.ceil(size * 0.44),
      fill: "rgba(250,248,243,0.98)",
      halo: "rgba(10,8,5,0.9)",
      haloWidth: Math.max(2.5 * dpr, size / 6),
      iconSize: 0,
      iconGap: 0,
      iconHaloWidth: 0,
      sideFont: `600 ${size * 0.68}px Cinzel, Georgia, 'Times New Roman', serif`,
      sideFill: "rgba(232,224,208,0.92)",
      sideGap: size * 0.35,
      sideHaloWidth: 2 * dpr,
      subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
      subFill: "rgba(232,224,208,0.92)",
      subHaloWidth: 2 * dpr,
      subBaselineOffset: size * 0.98,
    };
  }
  return {
    font: `600 ${size}px Cinzel, Georgia, 'Times New Roman', serif`,
    letterSpacing: `${0.5 * dpr}px`,
    size,
    padding: Math.ceil(size * 0.42),
    fill: "rgba(248,244,237,0.98)",
    halo: "rgba(14,10,7,0.88)",
    haloWidth: 3.1 * dpr,
    iconSize: size * 1.25,
    iconGap: size * 0.32,
    iconHaloWidth: 30,
    sideFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
    sideFill: "rgba(238,232,218,0.95)",
    sideGap: size * 0.42,
    sideHaloWidth: 2.4 * dpr,
    subFont: `600 ${size * 0.72}px Cinzel, Georgia, 'Times New Roman', serif`,
    subFill: "rgba(248,244,237,0.96)",
    subHaloWidth: 2.7 * dpr,
    subBaselineOffset: size * 0.98,
  };
}

interface SeaLabelGlyph {
  char: string;
  width: number;
  center: number;
}

interface SeaLabelPath {
  glyphs: SeaLabelGlyph[];
  width: number;
  height: number;
  depth: number;
}

function measureSeaLabel(
  ctx: CanvasRenderingContext2D,
  style: ReturnType<typeof labelStyle>,
  label: CampaignLabel,
  text: string,
): SeaLabelPath {
  const { glyphs, width } = measureSeaLabelGlyphs(ctx, style.size, text);
  const depth = seaLabelCurveDepthPx(label, style.size, width);
  return {
    glyphs,
    width,
    height: style.size * 1.5 + Math.abs(depth) * 1.35,
    depth,
  };
}

/** Baseline bow of the curved sea text, in px at the given font size. */
function seaLabelCurveDepthPx(label: CampaignLabel, sizePx: number, widthPx: number) {
  const bend = label.curve ?? defaultSeaLabelCurve(label);
  return bend * Math.min(sizePx * 1.35, Math.max(sizePx * 0.42, widthPx * 0.075));
}

/** Per-glyph advances for curved sea text. Glyphs are drawn one at a time, so
 * the sea style's letter spacing (0.22 em) is applied manually between them —
 * both the atlas draw and the placement fitter measure through here. */
function measureSeaLabelGlyphs(ctx: CanvasRenderingContext2D, sizePx: number, text: string) {
  const previousLetterSpacing = ctx.letterSpacing;
  ctx.letterSpacing = "0px";
  const letterSpacing = sizePx * SEA_LABEL_LETTER_SPACING_EM;
  const chars = Array.from(text);
  const widths = chars.map((char) => ctx.measureText(char).width);
  const width = Math.max(
    1,
    widths.reduce((sum, value) => sum + value, 0) + Math.max(0, chars.length - 1) * letterSpacing,
  );
  let advance = 0;
  const glyphs = chars.map((char, index) => {
    const glyphWidth = widths[index];
    const center = advance + glyphWidth * 0.5;
    advance += glyphWidth + letterSpacing;
    return { char, width: glyphWidth, center };
  });
  ctx.letterSpacing = previousLetterSpacing;
  return { glyphs, width };
}

function seaLabelFont(sizePx: number) {
  return `italic 400 ${sizePx}px Georgia, 'Times New Roman', serif`;
}

function drawSeaLabelText(
  ctx: CanvasRenderingContext2D,
  entry: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: CampaignLabel;
    style: ReturnType<typeof labelStyle>;
  },
  path: SeaLabelPath,
) {
  ctx.letterSpacing = "0px";
  ctx.lineWidth = entry.style.haloWidth;
  ctx.strokeStyle = entry.style.halo;
  ctx.fillStyle = entry.style.fill;
  const centerX = entry.x + entry.width * 0.5;
  const baselineY = entry.y + entry.height * 0.5 + entry.style.size * 0.31;
  const startX = centerX - path.width * 0.5;
  const halfWidth = Math.max(1, path.width * 0.5);
  for (const glyph of path.glyphs) {
    const t = (glyph.center - halfWidth) / halfWidth;
    const y = path.depth * (1 - t * t);
    const tangent = Math.atan((-2 * path.depth * t) / halfWidth);
    ctx.save();
    ctx.translate(startX + glyph.center, baselineY + y);
    ctx.rotate(tangent);
    ctx.strokeText(glyph.char, -glyph.width * 0.5, 0);
    ctx.fillText(glyph.char, -glyph.width * 0.5, 0);
    ctx.restore();
  }
}

function defaultSeaLabelCurve(label: CampaignLabel) {
  return label.text.length > 14 ? -0.55 : 0.4;
}

function drawLabelIcon(
  ctx: CanvasRenderingContext2D,
  label: CampaignLabel,
  x: number,
  y: number,
  style: ReturnType<typeof labelStyle>,
) {
  if (!label.icon) return;
  const path = new Path2D(ICON_PATHS[label.icon]);
  const s = style.iconSize / 256;
  const color = label.iconColor ?? [0.57, 0.49, 0.36];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = style.iconHaloWidth;
  ctx.strokeStyle = style.halo;
  ctx.stroke(path);
  ctx.fillStyle = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
  ctx.fill(path);
  ctx.restore();
}

function nextPowerOfTwo(value: number) {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

function measureTextWithFont(
  ctx: CanvasRenderingContext2D,
  font: string,
  letterSpacing: string,
  text: string,
) {
  const prevFont = ctx.font;
  const prevLetterSpacing = ctx.letterSpacing;
  ctx.font = font;
  ctx.letterSpacing = letterSpacing;
  const width = ctx.measureText(text).width;
  ctx.font = prevFont;
  ctx.letterSpacing = prevLetterSpacing;
  return width;
}
