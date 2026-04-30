import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createDefaultScenario } from "@/models/defaults";
import { AssumptionsEditor } from "../AssumptionsEditor";
import type { Scenario } from "@/models";

function renderEditor(overrides: Partial<Scenario> = {}) {
  const scenario = { ...createDefaultScenario("Test"), ...overrides };
  const onUpdate = vi.fn();
  render(<AssumptionsEditor scenario={scenario} onUpdate={onUpdate} />);
  return { scenario, onUpdate };
}

describe("AssumptionsEditor", () => {
  it("renders simulation section", () => {
    renderEditor();
    expect(screen.getByText("Simulation")).toBeInTheDocument();
    expect(screen.getByText("Iterations")).toBeInTheDocument();
  });

  it("renders inflation section", () => {
    renderEditor();
    expect(screen.getByText("Inflation")).toBeInTheDocument();
    expect(screen.getByText("Inflation model")).toBeInTheDocument();
  });

  it("renders longevity section", () => {
    renderEditor();
    expect(screen.getByText("Longevity")).toBeInTheDocument();
    expect(screen.getByText("Longevity model")).toBeInTheDocument();
  });

  it("renders CMA table", () => {
    renderEditor();
    expect(screen.getByText("Capital Market Assumptions")).toBeInTheDocument();
    expect(screen.getByText("US Large Cap")).toBeInTheDocument();
    expect(screen.getByText("US Bonds")).toBeInTheDocument();
    expect(screen.getByText("TIPS")).toBeInTheDocument();
  });

  it("shows stochastic inflation details by default", () => {
    renderEditor();
    expect(screen.getByText("Long-run mean")).toBeInTheDocument();
  });

  it("shows reset buttons", () => {
    renderEditor();
    expect(screen.getByText("Reset to defaults")).toBeInTheDocument();
    expect(screen.getByText("Reset all assumptions to defaults")).toBeInTheDocument();
  });

  it("calls onUpdate when reset CMA is confirmed", () => {
    const { onUpdate } = renderEditor();
    fireEvent.click(screen.getByText("Reset to defaults"));
    // Confirmation modal: click the destructive Reset button
    const confirmButtons = screen.getAllByText("Reset");
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("shows random seed field", () => {
    renderEditor();
    expect(screen.getByText("Random seed")).toBeInTheDocument();
  });
});
