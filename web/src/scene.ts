// A scene owns a subtree of the DOM (shown in enter, hidden in exit) and
// gets the shared requestAnimationFrame callback while active.
export interface Scene {
  enter(): void;
  exit(): void | Promise<void>;
  frame(now: number): void | Promise<void>;
}

let current: Scene | null = null;

let transition: Promise<void> | null = null;
/** A transition requested inside a frame is not awaited by that frame. Exit's
 * drain resolves after it unwinds; only then may the next scene reuse resources. */
export function switchScene(s: Scene): void | Promise<void> {
  const change = (): void | Promise<void> => {
    const previous = current;
    current = null;
    const exited = previous?.exit();
    const enter = () => {
      current = s;
      s.enter();
    };
    if (exited) return exited.then(enter);
    enter();
  };
  const result = transition ? transition.then(change) : change();
  if (result) {
    const pending = result.finally(() => {
      if (transition === pending) transition = null;
    });
    transition = pending;
    return pending;
  }
}

export const currentScene = () => current;
