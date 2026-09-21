import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  binFrameIntervals,
  type TimestampedFrameInterval,
} from "../../battle/benchmark/benchmarkMetrics";
import "./BenchmarkFrameChart.css";

export interface BenchmarkChartSample extends TimestampedFrameInterval {
  phase?: string;
  simTick?: number;
  loopCpuMs?: number;
  renderer?: { gpuSubmission?: { submissionId: number } | null };
  camera?: { center: [number, number]; distance: number; yaw: number; pitch: number };
}

export interface BenchmarkChartPhase {
  name: string;
  startMs: number;
  endMs: number;
}

export interface BenchmarkFrameChartProps {
  samples: readonly BenchmarkChartSample[];
  phases: readonly BenchmarkChartPhase[];
  gpuResults?: readonly {
    submissionId: number;
    status: string;
    observedGpuSpanMs?: number | null;
  }[];
}

export function BenchmarkFrameChart({ samples, phases, gpuResults }: BenchmarkFrameChartProps) {
  const gpuBySubmission = useMemo(
    () => new Map(gpuResults?.map((result) => [result.submissionId, result])),
    [gpuResults],
  );
  const descriptionId = useId();
  const [selection, setSelection] = useState({ index: 0, extreme: "max" as "min" | "max" });
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    observer.observe(plotRef.current!);
    return () => observer.disconnect();
  }, []);
  const left = 54;
  const right = width - 82;
  const top = 32;
  const bottom = 232;
  const { bins, invalidCount } = useMemo(
    () => binFrameIntervals(samples, Math.max(1, Math.floor(right - left))),
    [samples, right],
  );
  const durationMs = bins.at(-1)?.endMs ?? 0;
  const maxMs = bins.reduce((maximum, bin) => Math.max(maximum, bin.max.intervalMs), 50);
  const ceilingMs = Math.ceil((maxMs * 1.1) / 10) * 10;
  const x = (ms: number) => left + (ms / (durationMs || 1)) * (right - left);
  const y = (ms: number) => bottom - (ms / ceilingMs) * (bottom - top);
  const referenceLabels = [
    { ms: 16.67, labelY: Math.min(y(16.67) + 4, bottom) },
    { ms: 33.33, labelY: Math.min(y(33.33) + 4, y(16.67) - 11, bottom - 15) },
  ];
  const selectedIndex = Math.min(selection.index, bins.length - 1);
  const selected = bins[selectedIndex]?.[selection.extreme];
  const gpuSubmission = selected?.renderer?.gpuSubmission;
  const selectedGpu = gpuSubmission ? gpuBySubmission.get(gpuSubmission.submissionId) : undefined;
  const selectedPhase =
    selected?.phase ??
    phases.find(
      (phase) =>
        selected && selected.elapsedMs >= phase.startMs && selected.elapsedMs <= phase.endMs,
    )?.name;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!bins.length) return;
    let index = selectedIndex;
    let extreme = selection.extreme;
    switch (event.key) {
      case "ArrowLeft":
        index = Math.max(0, index - 1);
        break;
      case "ArrowRight":
        index = Math.min(bins.length - 1, index + 1);
        break;
      case "Home":
        index = 0;
        break;
      case "End":
        index = bins.length - 1;
        break;
      case "ArrowUp":
        extreme = "max";
        break;
      case "ArrowDown":
        extreme = "min";
        break;
      default:
        return;
    }
    event.preventDefault();
    setSelection({ index, extreme });
  }

  function inspectPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * 280;
    let distance = Infinity;
    let nearest = selection;
    bins.forEach((bin, index) => {
      for (const extreme of ["min", "max"] as const) {
        const sample = bin[extreme];
        const candidate = Math.hypot(
          x(sample.elapsedMs) - pointerX,
          y(sample.intervalMs) - pointerY,
        );
        if (candidate < distance) {
          distance = candidate;
          nearest = { index, extreme };
        }
      }
    });
    setSelection(nearest);
  }

  return (
    <figure className="benchmark-frame-chart hud-chassis">
      <figcaption>Frame time through the battle</figcaption>
      <div
        ref={plotRef}
        className="benchmark-frame-chart__plot"
        role="group"
        aria-label="Frame time chart"
        aria-describedby={descriptionId}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {bins.length > 0 && (
          <svg
            viewBox={`0 0 ${width} 280`}
            preserveAspectRatio="none"
            aria-hidden="true"
            onPointerMove={inspectPointer}
            onPointerDown={inspectPointer}
          >
            {phases.map((phase, index) => {
              const start = x(Math.max(0, Math.min(durationMs, phase.startMs)));
              const end = x(Math.max(0, Math.min(durationMs, phase.endMs)));
              return (
                <g
                  className="benchmark-frame-chart__phase-group"
                  key={`${phase.name}-${phase.startMs}`}
                >
                  <rect
                    className="benchmark-frame-chart__phase"
                    x={start}
                    y={top}
                    width={Math.max(0, end - start)}
                    height={bottom - top}
                  />
                  {end - start > 14 && (
                    <text x={(start + end) / 2} y={22} textAnchor="middle">
                      {end - start > phase.name.length * 8 ? phase.name : index + 1}
                    </text>
                  )}
                </g>
              );
            })}
            {referenceLabels.map(({ ms, labelY }) => (
              <g key={ms}>
                <line
                  className="benchmark-frame-chart__reference"
                  x1={left}
                  x2={right}
                  y1={y(ms)}
                  y2={y(ms)}
                />
                <line
                  className="benchmark-frame-chart__reference"
                  x1={right}
                  x2={right + 4}
                  y1={y(ms)}
                  y2={labelY - 4}
                />
                <text x={right + 6} y={labelY}>
                  {ms} ms
                </text>
              </g>
            ))}
            {[0, ceilingMs / 2, ceilingMs].map((ms) => (
              <text key={ms} x={left - 8} y={y(ms) + 4} textAnchor="end">
                {ms}
              </text>
            ))}
            <text x={left - 8} y={18} textAnchor="end">
              ms
            </text>
            {bins.map((bin) => (
              <path
                key={bin.startMs}
                className="benchmark-frame-chart__envelope"
                d={`M ${x(bin.min.elapsedMs)} ${y(bin.min.intervalMs)} L ${x(bin.max.elapsedMs)} ${y(bin.max.intervalMs)} M ${x(bin.max.elapsedMs) - 1} ${y(bin.max.intervalMs)} h 2`}
              />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <text key={fraction} x={left + fraction * (right - left)} y={252} textAnchor="middle">
                {Number(((durationMs * fraction) / 1000).toFixed(2))}
              </text>
            ))}
            <text x={(left + right) / 2} y={274} textAnchor="middle">
              Elapsed seconds
            </text>
            {selected && (
              <g>
                <line
                  className="benchmark-frame-chart__cursor"
                  x1={x(selected.elapsedMs)}
                  x2={x(selected.elapsedMs)}
                  y1={top}
                  y2={bottom}
                />
                <circle
                  className="benchmark-frame-chart__point"
                  cx={x(selected.elapsedMs)}
                  cy={y(selected.intervalMs)}
                  r={4}
                />
              </g>
            )}
          </svg>
        )}
      </div>
      <div className="benchmark-frame-chart__detail" role="status">
        {selected ? (
          <>
            Interval {Number(selected.intervalMs.toFixed(2))} ms · Elapsed{" "}
            {Number((selected.elapsedMs / 1000).toFixed(2))} s
            {selectedPhase && <> · Phase {selectedPhase}</>}
            {selected.simTick !== undefined && <> · Sim tick {selected.simTick}</>}
            {selected.loopCpuMs !== undefined && (
              <> · Callback CPU {Number(selected.loopCpuMs.toFixed(2))} ms</>
            )}
            <>
              {" "}
              · GPU span (includes gaps){" "}
              {selectedGpu?.status === "complete" &&
              typeof selectedGpu.observedGpuSpanMs === "number" &&
              Number.isFinite(selectedGpu.observedGpuSpanMs) &&
              selectedGpu.observedGpuSpanMs >= 0
                ? `${selectedGpu.observedGpuSpanMs.toFixed(2)} ms`
                : "unavailable"}
            </>
            {selected.camera && (
              <>
                {" "}
                · Camera ({selected.camera.center.map((value) => value.toFixed(1)).join(", ")}) ·
                distance {selected.camera.distance.toFixed(1)} m · yaw{" "}
                {selected.camera.yaw.toFixed(2)} · pitch {selected.camera.pitch.toFixed(2)}
              </>
            )}
          </>
        ) : (
          "No valid frame intervals were recorded."
        )}
      </div>
      {invalidCount > 0 && (
        <p className="benchmark-frame-chart__note">
          {invalidCount} invalid samples omitted from the chart.
        </p>
      )}
      <ol className="benchmark-frame-chart__phases">
        {phases.map((phase, index) => (
          <li key={`${phase.name}-${phase.startMs}`}>
            {index + 1}. {phase.name} · {phase.startMs / 1000}–{phase.endMs / 1000} s
          </li>
        ))}
      </ol>
      <p className="benchmark-frame-chart__note" id={descriptionId}>
        Each mark shows a frame interval; dense columns retain their fastest and slowest frames.
        Inspect with the pointer or focus the chart: left/right moves through time; up/down inspects
        slower/faster frames.
      </p>
    </figure>
  );
}
