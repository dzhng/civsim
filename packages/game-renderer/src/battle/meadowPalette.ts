import type { BattleGroundCover } from "./terrainFeatures";

export type Rgb = readonly [number, number, number];

const MEADOW_ANCHOR: Rgb = [0.4, 0.49, 0.26];

function fromAnchor(base: Rgb, legacy: Rgb): Rgb {
  return [
    base[0] * (legacy[0] / MEADOW_ANCHOR[0]),
    base[1] * (legacy[1] / MEADOW_ANCHOR[1]),
    base[2] * (legacy[2] / MEADOW_ANCHOR[2]),
  ];
}

export const GROUND_COVER_COLOR: Readonly<Record<BattleGroundCover, Rgb>> = {
  "green-grass": MEADOW_ANCHOR,
  "yellow-grass": fromAnchor(MEADOW_ANCHOR, [0.6, 0.57, 0.31]),
  "scrub-grass": fromAnchor(MEADOW_ANCHOR, [0.52, 0.53, 0.34]),
  sand: fromAnchor(MEADOW_ANCHOR, [0.74, 0.66, 0.46]),
};

export interface MeadowFamily {
  readonly base: Rgb;
  readonly blade: {
    readonly source: "packages/game-renderer/src/battle/meadowPalette.ts MEADOW.blade";
    readonly root: Rgb;
    readonly mid: Rgb;
    readonly tip: Rgb;
    readonly dryTipMix: number;
    readonly ringMeadow: Rgb;
  };
  readonly farGrass: {
    readonly low: Rgb;
    readonly high: Rgb;
    readonly shadow: Rgb;
    readonly lift: Rgb;
  };
  readonly quad: {
    readonly default: MeadowQuadStylePalette;
    readonly wideDetail: MeadowQuadStylePalette;
    readonly scrub: Rgb;
    readonly rakedDust: Rgb;
    readonly lightFleck: Rgb;
    readonly stoneFleck: Rgb;
    readonly sunBleached: Rgb;
    readonly backdrop: {
      readonly low: Rgb;
      readonly high: Rgb;
      readonly shadow: Rgb;
      readonly fleck: Rgb;
    };
  };
  readonly earth: {
    readonly forestFloor: Rgb;
    readonly mud: Rgb;
    readonly roadDust: Rgb;
  };
}

export interface MeadowQuadStylePalette {
  readonly oliveLow: Rgb;
  readonly oliveHigh: Rgb;
  readonly dry: Rgb;
  readonly stubble: Rgb;
  readonly darkFleck: Rgb;
}

export function meadowFamily(base: Rgb): MeadowFamily {
  const color = (legacy: Rgb): Rgb => fromAnchor(base, legacy);
  const blade = {
    source: "packages/game-renderer/src/battle/meadowPalette.ts MEADOW.blade",
    root: color([0.46, 0.52, 0.25]),
    mid: color([0.58, 0.61, 0.32]),
    tip: color([0.71, 0.71, 0.42]),
    dryTipMix: 0.05,
    ringMeadow: color([0.47, 0.53, 0.32]),
  } as const;
  const defaultQuad = {
    oliveLow: color([0.43, 0.56, 0.22]),
    oliveHigh: color([0.66, 0.69, 0.33]),
    dry: color([0.76, 0.67, 0.39]),
    stubble: color([0.53, 0.48, 0.25]),
    darkFleck: color([0.47, 0.43, 0.32]),
  };
  const wideDetailQuad = {
    oliveLow: color([0.44, 0.58, 0.22]),
    oliveHigh: color([0.68, 0.71, 0.33]),
    dry: color([0.75, 0.67, 0.39]),
    stubble: color([0.52, 0.47, 0.25]),
    darkFleck: color([0.45, 0.42, 0.31]),
  };

  return {
    base: [base[0], base[1], base[2]],
    blade,
    farGrass: {
      low: color([0.36, 0.42, 0.22]),
      high: color([0.62, 0.63, 0.4]),
      shadow: color([0.28, 0.33, 0.17]),
      lift: color([0.72, 0.72, 0.47]),
    },
    quad: {
      default: defaultQuad,
      wideDetail: wideDetailQuad,
      scrub: color([0.31, 0.39, 0.18]),
      rakedDust: color([0.88, 0.75, 0.47]),
      lightFleck: color([0.13, 0.12, 0.055]),
      stoneFleck: color([0.46, 0.43, 0.32]),
      sunBleached: color([0.86, 0.72, 0.46]),
      backdrop: {
        low: color([0.16, 0.25, 0.12]),
        high: color([0.3, 0.42, 0.2]),
        shadow: color([0.11, 0.18, 0.1]),
        fleck: color([0.1, 0.12, 0.04]),
      },
    },
    earth: {
      forestFloor: color([0.24, 0.34, 0.19]),
      mud: color([0.4, 0.33, 0.23]),
      roadDust: color([0.56, 0.53, 0.45]),
    },
  };
}

export const MEADOW = meadowFamily(GROUND_COVER_COLOR["green-grass"]);
