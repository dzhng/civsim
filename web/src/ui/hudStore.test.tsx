import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createHudStore, useHudStore } from "./hudStore";

describe("hudStore", () => {
  it("renders at most once per changed selection and ignores identical state", () => {
    const initial = { value: "ready", unrelated: 0 };
    const store = createHudStore(initial);
    let renders = 0;
    let setCalls = 0;

    function Probe() {
      renders += 1;
      const value = useHudStore(store, (state) => state.value);
      return <span>{value}</span>;
    }

    render(<Probe />);
    const initialRenders = renders;

    act(() => {
      setCalls += 1;
      store.set(initial);
    });
    expect(renders).toBe(initialRenders);

    act(() => {
      setCalls += 1;
      store.set({ value: "ready", unrelated: 1 });
    });
    expect(renders).toBe(initialRenders);

    act(() => {
      setCalls += 1;
      store.set({ value: "running", unrelated: 1 });
    });
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(renders - initialRenders).toBeLessThanOrEqual(setCalls);
  });
});
