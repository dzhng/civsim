export interface CampaignMarker {
  x: number;
  y: number;
  radius: number;
  faction: [number, number, number];
  allegiance: [number, number, number];
  kind?: "city" | "army";
  selected?: boolean;
}

/** Shared screen-standard paint; marker placement remains campaign policy. */
export const CAMPAIGN_MARKER_COLOR_WGSL = `fn campaignMarkerColor(local: vec2f, faction: vec3f, selected: f32) -> vec4f {
  let edge = vec3f(0.16, 0.12, 0.07);
  let parchment = vec3f(0.97, 0.94, 0.86);
  let gold = vec3f(0.79, 0.64, 0.15);
  let pole = select(0.0, 1.0, abs(local.x + 0.55) < 0.045 && local.y > -0.96 && local.y < 0.94);
  let finial = select(0.0, 1.0, length(local - vec2f(-0.55, -0.9)) < 0.105);
  let crossbar = select(0.0, 1.0, local.x > -0.78 && local.x < 0.58 && abs(local.y + 0.58) < 0.035);
  let clothLeft = -0.38;
  let clothRight = 0.42;
  let clothMid = 0.02;
  let clothTop = -0.52;
  let clothBottom = 0.82;
  let notchTop = 0.58;
  let notchSlope = 0.34 / (clothBottom - notchTop);
  let clothRect = select(0.0, 1.0, local.x > clothLeft && local.x < clothRight && local.y > clothTop && local.y < clothBottom);
  let notch = select(0.0, 1.0, local.y > notchTop && abs(local.x - clothMid) < (local.y - notchTop) * notchSlope);
  let cloth = clothRect * (1.0 - notch);
  // Trim width is sized so the gold edging survives the 9 px whole-map marker
  // (0.035 quantized to sub-pixel there, erasing the cloth's contour).
  let trimW = 0.06;
  let sideTrim = cloth * select(0.0, 1.0, abs(local.x - clothLeft) < trimW || abs(local.x - clothRight) < trimW);
  let topTrim = cloth * select(0.0, 1.0, abs(local.y - clothTop) < trimW);
  let tailTrim = cloth * select(0.0, 1.0, local.y > clothBottom - 0.065 && abs(local.x - clothMid) > 0.18);
  let notchTrim = select(0.0, 1.0, local.y > notchTop && local.y < clothBottom && abs(abs(local.x - clothMid) - (local.y - notchTop) * notchSlope) < trimW);
  let trim = max(max(sideTrim, topTrim), max(tailTrim, notchTrim));
  let emblem = select(0.0, 1.0, abs(local.x - clothMid) + abs(local.y + 0.12) < 0.14);
  let selectedEdge = vec3f(0.96, 0.93, 0.84);
  let outline = select(
    0.0,
    1.0,
    selected > 0.5 &&
      local.x > -0.84 &&
      local.x < 0.64 &&
      local.y > -0.98 &&
      local.y < 0.96 &&
      (abs(local.x + 0.84) < 0.04 || abs(local.x - 0.64) < 0.04 || abs(local.y + 0.98) < 0.04 || abs(local.y - 0.96) < 0.04)
  );
  let alpha = max(max(max(pole, finial), max(crossbar, cloth)), max(max(trim, emblem), outline * 0.85));
  if (alpha <= 0.0) { discard; }
  let hardware = max(max(pole, finial), crossbar);
  let goldInk = max(max(trim, emblem), finial);
  // The cloth is graded from an ink-deepened foot to a parchment-lit head so a
  // livery that matches the land or its own territory wash (Arverni green over
  // green Gaul) still reads as solid cloth, not a hollow outline. The livery
  // hue stays the faction color — only luminance structure is added. (The head
  // is the low-y end now that the fragment y is flipped, so lift runs from the
  // foot up.)
  let clothLift = clamp((clothBottom - local.y) / (clothBottom - clothTop), 0.0, 1.0);
  let clothColor = mix(mix(faction, edge, 0.30), mix(faction, parchment, 0.26), clothLift);
  var fill = mix(edge, clothColor, cloth);
  fill = mix(fill, edge, hardware * (1.0 - finial));
  fill = mix(fill, gold, goldInk);
  return vec4f(mix(fill, selectedEdge, outline * 0.75), alpha);
}`;
