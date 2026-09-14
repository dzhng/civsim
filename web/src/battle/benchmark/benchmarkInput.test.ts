import { expect, test, vi } from "vitest";
import { lockBenchmarkInput } from "./benchmarkInput";

test("benchmark owns game input while its controls and browser shortcuts work", () => {
  document.body.innerHTML =
    '<div id="battle-ui"><canvas></canvas></div><section id="battle-benchmark-status"><button>Cancel</button></section>';
  const abort = new AbortController();
  const focus = vi.fn(),
    game = vi.fn(),
    button = vi.fn();
  lockBenchmarkInput(abort.signal, focus);
  window.addEventListener("keydown", game, { signal: abort.signal });
  document.querySelector("button")!.addEventListener("keydown", button);
  const cameraKey = new KeyboardEvent("keydown", { key: "w", bubbles: true, cancelable: true });
  document.querySelector("canvas")!.dispatchEvent(cameraKey);
  expect(game).not.toHaveBeenCalled();
  expect(cameraKey.defaultPrevented).toBe(true);
  document
    .querySelector("button")!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(button).toHaveBeenCalledOnce();
  expect(game).not.toHaveBeenCalled();
  const browserKey = new KeyboardEvent("keydown", {
    key: "r",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(browserKey);
  expect(browserKey.defaultPrevented).toBe(false);
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(focus).toHaveBeenCalledOnce();
  abort.abort();
  expect(document.getElementById("battle-ui")!.inert).toBeFalsy();
});
