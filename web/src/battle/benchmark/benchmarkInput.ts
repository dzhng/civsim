/** The benchmark tour owns game input; browser shortcuts and benchmark controls remain usable. */
export function lockBenchmarkInput(signal: AbortSignal, focusCancel: () => void) {
  const ui = document.getElementById("battle-ui")!;
  const previousInert = ui.inert;
  ui.inert = true;
  const guard = (event: Event) => {
    const inPanel =
      event.target instanceof Element && event.target.closest("#battle-benchmark-status");
    if (inPanel) return;
    event.stopImmediatePropagation();
    if (event instanceof KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key === "Tab") return;
      if (event.key === "Escape" && event.type === "keydown") focusCancel();
    }
    if (event.cancelable) event.preventDefault();
  };
  for (const type of [
    "keydown",
    "keyup",
    "mousedown",
    "mouseup",
    "mousemove",
    "click",
    "dblclick",
    "contextmenu",
    "wheel",
  ])
    window.addEventListener(type, guard, { signal, capture: true, passive: false });
  const panel = document.getElementById("battle-benchmark-status")!;
  for (const type of ["keydown", "keyup"])
    panel.addEventListener(type, (event) => event.stopPropagation(), { signal });
  signal.addEventListener(
    "abort",
    () => {
      ui.inert = previousInert;
    },
    { once: true },
  );
}
