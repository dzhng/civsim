import { MEADOW } from "./meadowPalette";
type Rgb = readonly [number, number, number];

/** Authored underlay appearance; all backends consume the same style thresholds. */
export interface TerrainQuadStyle {
  oliveLow: Rgb;
  oliveHigh: Rgb;
  dry: Rgb;
  lightFleckLow: number;
  lightFleckHigh: number;
  darkFleckLow: number;
  darkFleckHigh: number;
  stoneFleckLow: number;
  stoneFleckHigh: number;
  stubbleColor: Rgb;
  darkFleckColor: Rgb;
}

export const DEFAULT_TERRAIN_STYLE: TerrainQuadStyle = {
  oliveLow: MEADOW.quad.default.oliveLow,
  oliveHigh: MEADOW.quad.default.oliveHigh,
  dry: MEADOW.quad.default.dry,
  lightFleckLow: 0.884,
  lightFleckHigh: 0.99,
  darkFleckLow: 0.82,
  darkFleckHigh: 0.982,
  stoneFleckLow: 0.924,
  stoneFleckHigh: 0.996,
  stubbleColor: MEADOW.quad.default.stubble,
  darkFleckColor: MEADOW.quad.default.darkFleck,
};

export const WIDE_DETAIL_TERRAIN_STYLE: TerrainQuadStyle = {
  oliveLow: MEADOW.quad.wideDetail.oliveLow,
  oliveHigh: MEADOW.quad.wideDetail.oliveHigh,
  dry: MEADOW.quad.wideDetail.dry,
  lightFleckLow: 0.876,
  lightFleckHigh: 0.988,
  darkFleckLow: 0.8,
  darkFleckHigh: 0.976,
  stoneFleckLow: 0.916,
  stoneFleckHigh: 0.995,
  stubbleColor: MEADOW.quad.wideDetail.stubble,
  darkFleckColor: MEADOW.quad.wideDetail.darkFleck,
};

export function terrainBackdropStyleForZoom(zoom: number): "default" | "wide-detail" {
  return zoom < 1.2 ? "wide-detail" : "default";
}
