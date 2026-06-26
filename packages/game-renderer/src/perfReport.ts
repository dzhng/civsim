export interface FrameSummary {
  samples: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

export interface PerfSceneInput {
  id: string;
  label: string;
  route: string;
  renderer: string;
  frameTimes: number[];
  stats?: Record<string, unknown>;
  notes?: string[];
}

export interface PerfSceneReport extends PerfSceneInput {
  frame: FrameSummary;
}

export interface FullGamePerfReport {
  kind: 'webgpu-full-game-perf';
  mode: 'headless-liveness' | 'hardware-report';
  generatedAt: string;
  environment: {
    browser: string;
    gpu: string;
    viewport: string;
    dpr: number;
  };
  scenes: PerfSceneReport[];
  releaseBudget: 'not-set' | 'candidate' | 'pass' | 'fail';
  notes: string[];
}

export function summarizeFrameTimes(frameTimes: number[]): FrameSummary {
  const clean = frameTimes.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (clean.length === 0) {
    return { samples: 0, avgMs: 0, medianMs: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  }
  const sum = clean.reduce((total, value) => total + value, 0);
  return {
    samples: clean.length,
    avgMs: sum / clean.length,
    medianMs: percentile(clean, 0.5),
    p95Ms: percentile(clean, 0.95),
    minMs: clean[0],
    maxMs: clean[clean.length - 1],
  };
}

export function makePerfSceneReport(input: PerfSceneInput): PerfSceneReport {
  return { ...input, frame: summarizeFrameTimes(input.frameTimes) };
}

export function makeFullGamePerfReport(input: {
  mode: FullGamePerfReport['mode'];
  environment: FullGamePerfReport['environment'];
  scenes: PerfSceneInput[];
  releaseBudget?: FullGamePerfReport['releaseBudget'];
  notes?: string[];
}): FullGamePerfReport {
  return {
    kind: 'webgpu-full-game-perf',
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    environment: input.environment,
    scenes: input.scenes.map(makePerfSceneReport),
    releaseBudget: input.releaseBudget ?? 'not-set',
    notes: input.notes ?? [],
  };
}

export function formatPerfSummary(report: FullGamePerfReport): Record<string, unknown> {
  const out: Record<string, unknown> = {
    mode: report.mode,
    gpu: report.environment.gpu,
    viewport: report.environment.viewport,
    dpr: report.environment.dpr,
    scenes: report.scenes.length,
    releaseBudget: report.releaseBudget,
  };
  for (const scene of report.scenes) {
    out[`${scene.id}.medianMs`] = scene.frame.medianMs.toFixed(2);
    out[`${scene.id}.p95Ms`] = scene.frame.p95Ms.toFixed(2);
    out[`${scene.id}.samples`] = scene.frame.samples;
  }
  return out;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 1) return sorted[0];
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx];
}
