export function turfTelemetry(input: { data: Uint8Array; height: number; width: number }): {
  sampleCount: number;
  meanLuma: number;
  lumaP10: number;
  lumaP90: number;
  lumaSpanP90P10: number;
  midBandRms: number;
  oklab: {
    meanHueDeg: number;
    meanChroma: number;
    hueSpreadDeg: number;
    chromaSpread: number;
  };
};
