import type { BenchmarkRun } from "./benchmarkRun";

/** The terminal summary is deliberately small; the result chart attaches here. */
export function mountBenchmarkPanel(run: BenchmarkRun, cancel: () => void, signal: AbortSignal) {
  const panel = document.createElement("section");
  panel.id = "battle-benchmark-status";
  panel.className = "hud-chassis";
  Object.assign(panel.style, {
    position: "fixed",
    top: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "60",
    padding: "10px 16px",
    color: "#ecd8aa",
    background: "#30271d",
    border: "1px solid #8d744b",
    pointerEvents: "auto",
    maxWidth: "calc(100vw - 32px)",
    textAlign: "center",
  });
  const title = document.createElement("strong");
  title.textContent = "BATTLE BENCHMARK";
  const text = document.createElement("p");
  text.setAttribute("role", "status");
  const button = document.createElement("button");
  button.textContent = "Cancel benchmark";
  button.addEventListener("click", cancel, { signal });
  const menu = document.createElement("a");
  menu.href = "/";
  menu.textContent = "Back to menu";
  panel.append(title, text, button, menu);
  document.body.append(panel);
  const unsubscribe = run.subscribe((status) => {
    const active = status.phase === "preparing" || status.phase === "running";
    button.hidden = !active;
    menu.hidden = active;
    const label =
      status.phase === "preparing"
        ? `Preparing battle: ${status.tick} / ${status.scenario.startTick} ticks`
        : status.phase === "running"
          ? `Running: ${Math.floor(status.elapsedMs / 1000)} / ${status.scenario.durationMs / 1000} seconds`
          : `${status.reason}. ${Math.floor(status.elapsedMs / 1000)} seconds recorded.`;
    if (text.textContent !== label) text.textContent = label;
  });
  signal.addEventListener(
    "abort",
    () => {
      unsubscribe();
      panel.remove();
    },
    { once: true },
  );
  return {
    showCancel: () => {
      button.focus();
      panel.scrollIntoView({ block: "nearest" });
    },
  };
}
