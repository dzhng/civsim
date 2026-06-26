export interface PerfSample {
  timestamp: number;
  frameMs: number;
  uploadMs: number;
  cullMs: number;
  drawMs: number;
  skinned: number;
  impostors: number;
  sprites: number;
  drawCalls: number;
}

export function createPerfAverager(size = 90) {
  const samples: PerfSample[] = [];
  return {
    push(sample: PerfSample) {
      samples.push(sample);
      while (samples.length > size) samples.shift();
    },
    snapshot() {
      const n = samples.length || 1;
      const sum = samples.reduce((a, s) => ({
        frameMs: a.frameMs + s.frameMs,
        uploadMs: a.uploadMs + s.uploadMs,
        cullMs: a.cullMs + s.cullMs,
        drawMs: a.drawMs + s.drawMs,
        skinned: a.skinned + s.skinned,
        impostors: a.impostors + s.impostors,
        sprites: a.sprites + s.sprites,
        drawCalls: a.drawCalls + s.drawCalls,
      }), { frameMs: 0, uploadMs: 0, cullMs: 0, drawMs: 0, skinned: 0, impostors: 0, sprites: 0, drawCalls: 0 });
      return {
        samples: samples.length,
        frameMs: sum.frameMs / n,
        uploadMs: sum.uploadMs / n,
        cullMs: sum.cullMs / n,
        drawMs: sum.drawMs / n,
        skinned: Math.round(sum.skinned / n),
        impostors: Math.round(sum.impostors / n),
        sprites: Math.round(sum.sprites / n),
        drawCalls: Math.round(sum.drawCalls / n),
      };
    },
  };
}

