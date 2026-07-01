import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameOver, PauseMenu } from "./BattleModals";

// Proves the vitest + @testing-library/react + jsdom toolchain, and pins the
// inCampaign branching the campaign-handoff harness relies on.
describe("GameOver", () => {
  it("shows VICTORY + Restart/Main Menu outside a campaign", () => {
    render(
      <GameOver
        win
        sub="Your army holds the field."
        onRestart={vi.fn()}
        onExit={vi.fn()}
        onWatch={vi.fn()}
      />,
    );
    expect(screen.getByText("VICTORY")).toBeInTheDocument();
    expect(screen.getByText("Your army holds the field.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart Battle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Main Menu" })).toBeInTheDocument();
  });

  it("shows DEFEAT + Continue and hides Restart in a campaign", () => {
    render(
      <GameOver
        win={false}
        sub="broken"
        inCampaign
        onRestart={vi.fn()}
        onExit={vi.fn()}
        onWatch={vi.fn()}
      />,
    );
    expect(screen.getByText("DEFEAT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restart Battle" })).toBeNull();
  });
});

describe("PauseMenu", () => {
  it("labels exit for the mode and shows Restart only outside a campaign", () => {
    const { rerender } = render(
      <PauseMenu onRestart={vi.fn()} onManual={vi.fn()} onExit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Exit to Main Menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart Battle" })).toBeInTheDocument();

    rerender(
      <PauseMenu
        inCampaign
        onRestart={vi.fn()}
        onManual={vi.fn()}
        onExit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Exit to Campaign" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restart Battle" })).toBeNull();
  });
});
