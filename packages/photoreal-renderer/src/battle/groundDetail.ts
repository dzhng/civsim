import { clamp, dot, float, mix, vec2, vec3 } from "three/tsl";
import { MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
import { fbmN, rgbNode, smoothstepN, type FloatNode, type Vec2Node, type Vec3Node } from "./battleTsl";

export const GROUND_DETAIL_TERMS = ["mottle", "canopy", "quad-flecks", "scrub"] as const;
export type GroundDetailTerm = (typeof GROUND_DETAIL_TERMS)[number];

export function groundDetailTermFromParam(value: string | null): GroundDetailTerm | null {
  return GROUND_DETAIL_TERMS.find((term) => term === value) ?? null;
}

/**
 * The single contrast owner for battle turf. These are amplitude/value controls,
 * not palette colors: meadow hue remains owned by meadowPalette.ts.
 */
export const TURF_CONTRAST = {
  ground: {
    driftStrength: 0.1,
    mottleStrength: 0.13,
    bladeStrength: 0.1,
    fineBladeStrength: 0.06,
    minimum: 0.68,
    maximum: 1.32,
  },
  canopy: {
    anchorMix: 0.5,
    anchorChroma: 0.55,
    anchorLift: 1.015,
    anchorWarmth: 0.048,
    valueSpread: 0.14,
    fiberSpread: 0.04,
    valueMinimum: 0.88,
    valueMaximum: 1.12,
    mixStrength: 0.42,
  },
  quad: {
    scrubStrength: 0.2,
    default: {
      oliveSpread: 0.6,
      speckleStrength: 0.19,
      dryMixBase: 0.22,
      trampleMix: 0.15,
      stubbleStrength: 0.055,
      darkFleckStrength: 0.23,
      stoneFleckStrength: 0.18,
      dustStrength: 0.14,
    },
    wideDetail: {
      oliveSpread: 0.6,
      speckleStrength: 0.195,
      dryMixBase: 0.2,
      trampleMix: 0.14,
      stubbleStrength: 0.063,
      darkFleckStrength: 0.25,
      stoneFleckStrength: 0.19,
      dustStrength: 0.12,
    },
  },
} as const;

/** Fixed spatial vocabulary; amplitudes and material weights live above. */
export const TURF_SHAPE = {
  ground: {
    driftScale: 0.08,
    mottleScale: 1.1,
    bladeScale: 4.7,
    fineBladeScale: 12,
  },
  canopy: {
    broadScale: 0.045,
    midScale: 0.14,
    contrastLow: 0.34,
    contrastHigh: 0.66,
    broadWeight: 0.62,
    midWeight: 0.38,
  },
} as const;

/** Compose the shared neutral ground-scale modulation before feature materials. */
export interface GroundDetailOptions {
  disabledTerm?: GroundDetailTerm | null;
  coverage?: FloatNode;
}

/** Compose the fixed-hue turf family from already-owned broad/mid signals. */
export function turfCanopyFromSignalsNode(
  broad: FloatNode,
  mid: FloatNode,
  fiber: FloatNode,
): Vec3Node {
  const c = TURF_CONTRAST.canopy;
  const shape = TURF_SHAPE.canopy;
  const canopy = smoothstepN(
    shape.contrastLow,
    shape.contrastHigh,
    broad.mul(shape.broadWeight).add(mid.mul(shape.midWeight)),
  );
  const anchor = mix(rgbNode(MEADOW.farGrass.low), rgbNode(MEADOW.farGrass.high), c.anchorMix);
  const neutral = dot(anchor, vec3(0.2126, 0.7152, 0.0722));
  const quietAnchor = mix(vec3(neutral), anchor, c.anchorChroma)
    .mul(c.anchorLift)
    .mul(vec3(1 + c.anchorWarmth, 1, 1 - c.anchorWarmth));
  const value = clamp(
    float(1)
      .add(canopy.sub(0.5).mul(c.valueSpread))
      .add(fiber.sub(0.5).mul(c.fiberSpread)),
    c.valueMinimum,
    c.valueMaximum,
  );
  return quietAnchor.mul(value);
}

/** The fixed-hue far-turf family shared by playable and vista ground. */
export function turfCanopyNode(world: Vec2Node, fiber: FloatNode): Vec3Node {
  const shape = TURF_SHAPE.canopy;
  const broad = fbmN(world.mul(shape.broadScale).add(vec2(2.5, 7))).toVar();
  const mid = fbmN(world.mul(shape.midScale).add(vec2(6, 1.5))).toVar();
  return turfCanopyFromSignalsNode(broad, mid, fiber);
}

export function groundDetailNode(
  world: Vec2Node,
  color: Vec3Node,
  options: GroundDetailOptions = {},
): Vec3Node {
  const c = TURF_CONTRAST.ground;
  const shape = TURF_SHAPE.ground;
  const drift = fbmN(world.mul(shape.driftScale)).sub(0.5).mul(c.driftStrength);
  const mottleStrength = options.disabledTerm === "mottle" ? 0 : c.mottleStrength;
  const mottle = fbmN(world.mul(shape.mottleScale)).sub(0.5).mul(mottleStrength);
  const blade = fbmN(world.mul(shape.bladeScale))
    .sub(0.5)
    .mul(c.bladeStrength)
    .add(fbmN(world.mul(shape.fineBladeScale)).sub(0.5).mul(c.fineBladeStrength));
  const detail = clamp(drift.add(mottle).add(blade).add(float(1)), c.minimum, c.maximum);
  return mix(color, color.mul(detail), options.coverage ?? float(1));
}
