export function naturalGroundColor(
  r: number,
  g: number,
  b: number,
): {
  olive: boolean;
  redBrown: boolean;
};
export const REFERENCE_GROUND_SAMPLES: [string, [number, number, number]][];
export const NON_GROUND_SAMPLES: [string, [number, number, number]][];
export function checkNaturalGroundClassifier(ctx: {
  check(name: string, ok: boolean, detail?: string): void;
}): void;
