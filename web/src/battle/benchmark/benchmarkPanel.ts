import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { BenchmarkResults } from "../../ui/benchmark/BenchmarkResults";
import { sampleBenchmarkCamera } from "./benchmarkCamera";
import type { BenchmarkRun, BenchmarkStatus } from "./benchmarkRun";
import type { BenchmarkReport } from "./benchmarkReport";

export function mountBenchmarkPanel(
  run: BenchmarkRun,
  cancel: () => void,
  signal: AbortSignal,
  report: () => BenchmarkReport,
) {
  const panel = document.createElement("section");
  panel.id = "battle-benchmark-status";
  Object.assign(panel.style, {
    position: "fixed",
    top: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "60",
    pointerEvents: "auto",
  });
  document.body.append(panel);
  const root = createRoot(panel);
  const unsubscribe = run.subscribe((status) => {
    root.render(
      status.phase === "preparing" || status.phase === "running"
        ? createElement(BenchmarkProgress, { status, cancel })
        : createElement(BenchmarkResults, { report: report() }),
    );
  });
  signal.addEventListener(
    "abort",
    () => {
      unsubscribe();
      root.unmount();
      panel.remove();
    },
    { once: true },
  );
  return { showCancel: () => panel.querySelector("button")?.focus() };
}

function BenchmarkProgress({ status, cancel }: { status: BenchmarkStatus; cancel: () => void }) {
  const preparing = status.phase === "preparing";
  return createElement(
    "div",
    {
      className: "benchmark-progress",
      onKeyDown: (event: import("react").KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") event.currentTarget.querySelector("button")?.focus();
      },
    },
    createElement("strong", null, "BATTLE BENCHMARK"),
    createElement(
      "p",
      { role: "status" },
      preparing
        ? `Preparing battle · tick ${status.tick.toLocaleString()} / ${status.scenario.startTick.toLocaleString()}`
        : `${Math.floor(status.elapsedMs / 1000)} / ${status.scenario.durationMs / 1000} seconds · ${sampleBenchmarkCamera(status.elapsedMs).phase}`,
    ),
    createElement(
      "small",
      null,
      preparing ? "Advancing to the fighting" : "Benchmark camera · controls are automatic",
    ),
    createElement("button", { onClick: cancel }, "Cancel benchmark"),
  );
}
