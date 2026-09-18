import {
  standardWaveDisplacement,
  STANDARD_WAVE_BACK_LOBE,
} from "../../../../packages/game-renderer/src/models/shared/standardAsset";
export { STANDARD_WAVE_BACK_LOBE };
export function waveSamples() {
  // Exactly representable inputs span weight=0, strength=0, both wave lobes,
  // several positions/phases, and animated times without a random fixture.
  return Array.from({ length: 512 }, (_, i) => ({
    local: [(i % 8) / 4, 0, (i % 13) / 4, (i % 5) / 4] as [number, number, number, number],
    settings: [(i % 7) / 2, (i % 4) / 8, (i % 19) / 2, STANDARD_WAVE_BACK_LOBE] as [
      number,
      number,
      number,
      number,
    ],
  }));
}
export function assertWaveSamples(actual: ArrayLike<number>) {
  const samples = waveSamples();
  if (actual.length !== samples.length) throw new Error("Wrong wave sample count");
  let maxError = 0;
  for (let i = 0; i < samples.length; i++) {
    const { local, settings } = samples[i];
    const expected = standardWaveDisplacement({
      local: [local[0], local[1], local[2]],
      weight: local[3],
      phase: settings[0],
      strength: settings[1],
      timeSeconds: settings[2],
    });
    const error = Math.abs(actual[i] - expected);
    if (!Number.isFinite(error)) throw new Error(`Non-finite wave sample ${i}`);
    maxError = Math.max(maxError, error);
  }
  if (maxError > 0.00001) throw new Error(`Wave error ${maxError} exceeds 1e-5 world units`);
  return { samples: samples.length, maxAbsoluteError: maxError, tolerance: 0.00001 };
}
