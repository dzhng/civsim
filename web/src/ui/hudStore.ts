import { useCallback, useRef, useSyncExternalStore } from "react";

export interface HudStore<T> {
  get(): T;
  set(next: T): void;
  subscribe(cb: () => void): () => void;
}

export function createHudStore<T>(initial: T): HudStore<T> {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    set(next) {
      if (Object.is(current, next)) return;
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

interface SelectionCache<T, S> {
  snapshot: T;
  selector: (value: T) => S;
  selection: S;
}

export function useHudStore<T, S>(store: HudStore<T>, select: (value: T) => S): S {
  const selector = useRef(select);
  selector.current = select;
  const cache = useRef<SelectionCache<T, S> | null>(null);
  const getSelection = useCallback(() => {
    const snapshot = store.get();
    const selectCurrent = selector.current;
    const previous = cache.current;
    if (previous && Object.is(previous.snapshot, snapshot) && previous.selector === selectCurrent) {
      return previous.selection;
    }
    const selection = selectCurrent(snapshot);
    cache.current = {
      snapshot,
      selector: selectCurrent,
      selection:
        previous && Object.is(previous.selection, selection) ? previous.selection : selection,
    };
    return cache.current.selection;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
