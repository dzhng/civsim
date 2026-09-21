// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { TooltipProvider } from "./Tooltip";
import { Toolbar } from "./Toolbar";
test("unchanged toolbar artwork survives state refresh", () => {
  const onCmd = () => {};
  const view = render(
    <TooltipProvider>
      <Toolbar state={{}} onCmd={onCmd} />
    </TooltipProvider>,
  );
  const icon = view.container.querySelector('[data-cmd="pace"] svg');
  expect(icon).not.toBeNull();
  view.rerender(
    <TooltipProvider>
      <Toolbar state={{ pause: { on: true, disabled: false } }} onCmd={onCmd} />
    </TooltipProvider>,
  );
  expect(view.container.querySelector('[data-cmd="pace"] svg')).toBe(icon);
  expect(view.container.querySelector('[data-cmd="pause"]')?.classList.contains("on")).toBe(true);
  view.unmount();
});
