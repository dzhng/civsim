import type { BenchmarkReport } from "../../battle/benchmark/benchmarkReport";
import { BenchmarkFrameChart } from "./BenchmarkFrameChart";
import "./BenchmarkResults.css";

const number = (value: number | null, suffix = "") =>
  value === null ? "—" : `${value.toFixed(1)}${suffix}`;

export function BenchmarkResults({ report }: { report: BenchmarkReport }) {
  const { summary, status, identity } = report;
  const cadenceMet =
    summary.averageFps !== null &&
    summary.averageFps >= 59 &&
    summary.spikes.over25Ms / summary.validCount <= 0.01 &&
    summary.spikes.over50Ms === 0;
  const exportReport = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `battle-benchmark-${status.scenario.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="benchmark-results">
      <div className="benchmark-results__body">
        <header>
          <p className="benchmark-eyebrow">Battle benchmark</p>
          <h1>{report.completeWindow ? "Five-minute result" : "Partial result"}</h1>
          <p>
            {status.reason} · {(status.elapsedMs / 1000).toFixed(1)} seconds recorded
          </p>
        </header>
        <dl className="benchmark-metrics">
          {[
            ["Average FPS", number(summary.averageFps)],
            ["1% low FPS", number(summary.low1PercentFps)],
            ["0.1% low FPS", number(summary.low01PercentFps)],
            ["Minimum FPS", number(summary.minFps)],
            ["Maximum FPS", number(summary.maxFps)],
            ["99th percentile frame", number(summary.p99FrameMs, " ms")],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>
          {summary.validCount.toLocaleString()} frame intervals · {summary.spikes.over50Ms} gaps
          over 50 ms · {summary.invalidCount} invalid intervals
        </p>
        <p>
          60 FPS cadence target:{" "}
          {report.completeWindow ? (cadenceMet ? "met" : "not met") : "partial run"}. Simulation
          advanced {report.simulatedSeconds.toFixed(1)} seconds.
        </p>
        <BenchmarkFrameChart
          samples={report.frames}
          phases={report.phases}
          gpuResults={report.gpu?.results}
        />
        <details>
          <summary>Camera phases and measurement details</summary>
          <p>
            Frame times: median {number(summary.p50FrameMs, " ms")} · 95th percentile{" "}
            {number(summary.p95FrameMs, " ms")} · 99th percentile{" "}
            {number(summary.p99FrameMs, " ms")}.
          </p>
          <p>
            {summary.spikes.over33_33Ms} gaps over 33.33 ms · {summary.spikes.over50Ms} gaps over 50
            ms.
          </p>
          <table>
            <thead>
              <tr>
                <th>Phase</th>
                <th>Average FPS</th>
                <th>1% low</th>
                <th>Gaps &gt;50 ms</th>
              </tr>
            </thead>
            <tbody>
              {report.phases.map((phase) => (
                <tr key={phase.name}>
                  <th>{phase.name}</th>
                  <td>{number(phase.summary.averageFps)}</td>
                  <td>{number(phase.summary.low1PercentFps)}</td>
                  <td>{phase.summary.spikes.over50Ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {identity
              ? `${identity.adapter} · ${identity.viewport.join(" × ")} window · ${identity.framebuffer.join(" × ")} render pixels · DPR ${identity.dpr}`
              : "No timed workload was captured."}
          </p>
          <p>
            {report.measurement}. Lows use the slowest 1%/0.1% of raw frame intervals.
            Minimum/maximum FPS are instantaneous extremes.
          </p>
          {report.gpu && (
            <p>
              GPU results: {report.gpu.results.length} terminal · {report.gpu.pendingOrMissingCount}{" "}
              pending or missing at run end · {report.gpu.lostEventCount} events lost across{" "}
              {report.gpu.cursorGapCount} cursor gaps. {report.gpu.exclusions}. GPU span runs from
              the first measured pass to the last, including gaps. Exported pass totals can overlap
              and are not elapsed GPU time.
            </p>
          )}
          <p>
            Preparation: {(status.preparationMs / 1000).toFixed(1)} seconds · {status.scenario.id} v
            {status.scenario.version} · camera {status.scenario.cameraScript}
          </p>
        </details>
      </div>
      <nav aria-label="Benchmark actions">
        <a className="benchmark-action" href="/benchmark">
          Run again
        </a>
        <button onClick={exportReport}>Export JSON</button>
        <a className="benchmark-action" href="/">
          Back to menu
        </a>
      </nav>
    </div>
  );
}
