// Reference grass spans yellow and olive (48–71° hue). Allow lighting variation,
// while excluding blue water, neutral gray and red-brown soil. This measures
// color coverage, not vegetation segmentation or material richness.
export function naturalGroundColor(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const hue =
    delta === 0
      ? 0
      : ((max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta) *
          60 +
          360) %
        360;
  const colored = max >= 70 && delta / Math.max(1, max) >= 0.2;
  return { olive: colored && hue >= 40 && hue <= 85, redBrown: colored && hue < 40 && r > 120 };
}

// Actual reference pixels: yellow field (95,185), olive field (285,197).
// Keep these tiny color controls independent of the active spec's location;
// full reference-patch coverage and crops remain in its acceptance evidence.
export const REFERENCE_GROUND_SAMPLES = [
  ["yellow field", [186, 164, 63]],
  ["olive field", [123, 133, 46]],
];

export const NON_GROUND_SAMPLES = [
  ["blue water", [52, 84, 110]],
  ["neutral gray rock", [140, 140, 140]],
  ["red-brown soil", [154, 100, 60]],
];

/** Check reference colors before measuring frame coverage. */
export function checkNaturalGroundClassifier(ctx) {
  for (const [name, rgb] of REFERENCE_GROUND_SAMPLES) {
    ctx.check(
      `natural-ground classifier accepts reference ${name}`,
      naturalGroundColor(...rgb).olive,
      JSON.stringify(rgb),
    );
  }
  for (const [name, rgb] of NON_GROUND_SAMPLES) {
    ctx.check(
      `natural-ground classifier rejects ${name}`,
      !naturalGroundColor(...rgb).olive,
      JSON.stringify(rgb),
    );
  }
}
