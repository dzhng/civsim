import type { CampaignLabel } from "@packages/game-renderer/src/campaign/labelFrame";

// Anchors sit at each sea's open-water center (measured against the render
// mask, keeping anchors off shore) and angles
// follow the basin's long axis in screen space (positive = falling to the
// right); the fitter only polishes from here.
export function seaLabels(): CampaignLabel[] {
  return [
    {
      text: "Mediterranean Sea",
      x: 320,
      y: -585,
      size: 28,
      kind: "sea",
      priority: 4,
      angle: -0.03,
      curve: -0.85,
    },
    {
      text: "Tyrrhenian Sea",
      x: -360,
      y: 120,
      size: 20,
      kind: "sea",
      priority: 4,
      angle: -0.5,
      curve: 0.55,
    },
    {
      text: "Ionian Sea",
      x: 30,
      y: -170,
      size: 18,
      kind: "sea",
      priority: 4,
      angle: -0.9,
      curve: 0.45,
    },
    {
      text: "Adriatic Sea",
      x: -15,
      y: 335,
      size: 18,
      kind: "sea",
      priority: 4,
      angle: 0.9,
      curve: -0.4,
    },
    // The Aegean anchor sits at the basin's south gate: the Cyclades leave no
    // clean full-rect placement in the island-studded center/north (best found
    // there is ~0.18 land), so water-coverage-first settles south of them.
    {
      text: "Aegean Sea",
      x: 460,
      y: -60,
      size: 17,
      kind: "sea",
      priority: 4,
      angle: -0.7,
      curve: 0.42,
    },
    { text: "Black Sea", x: 1480, y: 550, size: 24, kind: "sea", priority: 4, curve: 0.5 },
    { text: "Iberian Sea", x: -1250, y: 90, size: 22, kind: "sea", priority: 4, curve: -0.45 },
    {
      text: "Atlantic Ocean",
      x: -2200,
      y: 760,
      size: 15,
      kind: "sea",
      priority: 4,
      angle: -1.1,
      curve: 0.18,
    },
  ];
}

// Sea labels are screen-space text anchored to world points, so their world
// footprint is widest at the camera's zoom floor — the fit is judged there
// (style.seaLabelFitZoom), with SEA_LABEL_FIT_ZOOM as the conservative upper
// bound: the full-opacity threshold of the sea-label fade band.
export const SEA_LABEL_FIT_ZOOM = 0.26;
// Coast standoff added around the drawn rect. Kept small: narrow basins
// (Adriatic ~200 km wide) stop having any clean placement when the margin
// inflates the rect much further.
export const SEA_LABEL_LAND_MARGIN_KM = 12;
// Legibility floor: a sea name may shrink to this scale but never below —
// better a nudged full-size label than a vanishing one (move before shrink).
export const SEA_LABEL_MIN_SCALE = 0.55;
export const SEA_LABEL_SHRINK_STEP = 0.05;
// The move budget: seas are long, so the search runs farther along the
// label's axis (label.angle follows the basin) than across it. The budget is
// deliberately basin-scale — anchors sit at their sea's open-water center,
// and a bigger budget lets a cramped label defect into a roomier neighboring
// sea (Adriatic and Aegean both fled to the Ionian at 420 km).
export const SEA_LABEL_ALONG_NUDGE_KM = 240;
export const SEA_LABEL_ACROSS_NUDGE_KM = 150;
export const SEA_LABEL_NUDGE_STEP_KM = 20;
export const SEA_LABEL_SAMPLE_STEP_KM = 15;
// Sea text metrics shared by the style, the curved atlas draw, and the
// placement fitter — if these drift apart, the fitted box stops being the
// drawn box (the U2 bug class).
export const SEA_LABEL_LETTER_SPACING_EM = 0.22;
export const SEA_LABEL_PADDING_EM = 0.34;
