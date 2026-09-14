import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BenchmarkFrameChart } from "./BenchmarkFrameChart";

let resizeChart: (width: number) => void;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
        resizeChart = (width) => callback([{ contentRect: { width } }]);
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

test("a frame spike is plotted at its timestamp and exposes its original details", () => {
  render(
    <BenchmarkFrameChart
      samples={[
        { elapsedMs: 10, intervalMs: 10, phase: "Pan" },
        { elapsedMs: 130, intervalMs: 120, phase: "Contact", simTick: 42, loopCpuMs: 8.5 },
        { elapsedMs: 150, intervalMs: 20, phase: "Zoom" },
      ]}
      phases={[
        { name: "Pan", startMs: 0, endMs: 100 },
        { name: "Contact", startMs: 100, endMs: 140 },
        { name: "Zoom", startMs: 140, endMs: 150 },
      ]}
    />,
  );
  const chart = screen.getByRole("group", { name: "Frame time chart" });
  fireEvent.keyDown(chart, { key: "End" });
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  expect(screen.getByRole("status")).toHaveTextContent("120 ms");
  expect(screen.getByRole("status")).toHaveTextContent("0.13 s");
  expect(screen.getByRole("status")).toHaveTextContent("Contact");
  expect(screen.getByRole("status")).toHaveTextContent("42");
  expect(screen.getByRole("status")).toHaveTextContent("8.5 ms");
  expect(screen.getByText("16.67 ms")).toBeInTheDocument();
  expect(screen.getByText("33.33 ms")).toBeInTheDocument();
});

test("pointer inspection selects the original spike instead of the first frame", () => {
  const { container } = render(
    <BenchmarkFrameChart
      samples={[
        { elapsedMs: 10, intervalMs: 10 },
        { elapsedMs: 130, intervalMs: 120, phase: "Contact" },
        { elapsedMs: 150, intervalMs: 20 },
      ]}
      phases={[]}
    />,
  );
  const svg = container.querySelector("svg")!;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 900, 280));
  fireEvent(svg, new MouseEvent("pointermove", { bubbles: true, clientX: 716, clientY: 61 }));
  expect(screen.getByRole("status")).toHaveTextContent("Interval 120 ms");
  expect(screen.getByRole("status")).toHaveTextContent("Elapsed 0.13 s");
});

test("resizing rebins dense samples without hiding the large spike", () => {
  const samples = Array.from({ length: 600 }, (_, index) => ({
    elapsedMs: (index + 1) * 10,
    intervalMs: index === 299 ? 120 : 10,
  }));
  const { container } = render(<BenchmarkFrameChart samples={samples} phases={[]} />);
  act(() => resizeChart(320));
  const svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("viewBox", "0 0 320 280");
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 280));
  fireEvent(svg, new MouseEvent("pointermove", { bubbles: true, clientX: 146, clientY: 61 }));
  expect(screen.getByRole("status")).toHaveTextContent("Interval 120 ms");
  expect(screen.getByRole("status")).toHaveTextContent("Elapsed 3 s");
  expect(container.querySelector("circle")).toHaveAttribute("cx", "146");
});

test("invalid recordings explain missing data without drawing a misleading zero-duration graph", () => {
  const { container } = render(
    <BenchmarkFrameChart
      samples={[
        { elapsedMs: 10, intervalMs: 0 },
        { elapsedMs: NaN, intervalMs: 20 },
      ]}
      phases={[]}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("No valid frame intervals");
  expect(screen.getByText("2 invalid samples omitted from the chart.")).toBeInTheDocument();
  expect(container.querySelector("svg")).toBeNull();
});

test("a long stall remains on scale while the two reference labels stay separated", () => {
  render(
    <BenchmarkFrameChart
      samples={[
        { elapsedMs: 10, intervalMs: 10 },
        { elapsedMs: 1010, intervalMs: 1000 },
      ]}
      phases={[]}
    />,
  );
  const lower = Number(screen.getByText("16.67 ms").getAttribute("y"));
  const upper = Number(screen.getByText("33.33 ms").getAttribute("y"));
  expect(lower - upper).toBeGreaterThanOrEqual(14);
  fireEvent.keyDown(screen.getByRole("group", { name: "Frame time chart" }), { key: "End" });
  expect(screen.getByRole("status")).toHaveTextContent("Interval 1000 ms");
});
