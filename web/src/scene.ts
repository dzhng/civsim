// A scene owns a subtree of the DOM (shown in enter, hidden in exit) and
// gets the shared requestAnimationFrame callback while active.
export interface Scene {
  enter(): void;
  exit(): void;
  frame(now: number): void;
}

let current: Scene | null = null;

export function switchScene(s: Scene) {
  current?.exit();
  current = s;
  s.enter();
}

export const currentScene = () => current;
