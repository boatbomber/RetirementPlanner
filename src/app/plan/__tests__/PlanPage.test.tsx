import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppStore } from "@/store";
import { createDefaultScenario } from "@/models/defaults";
import { PlanPage } from "../PlanPage";

vi.mock("@/hooks/useSimulation", () => ({
  useSimulation: vi.fn(),
}));

function resetStore() {
  useAppStore.setState({
    scenarios: [],
    activeScenarioId: null,
    comparisonScenarioId: null,
    wizardCompleted: false,
    simulations: {},
  });
}

function renderPlan(tab = "") {
  return render(
    <MemoryRouter initialEntries={[`/plan/${tab}`]}>
      <PlanPage />
    </MemoryRouter>,
  );
}

describe("PlanPage", () => {
  beforeEach(resetStore);

  it("shows empty state when no scenario exists", () => {
    renderPlan();
    expect(screen.getByText("No scenario")).toBeInTheDocument();
    expect(screen.getByText("Start wizard")).toBeInTheDocument();
  });

  it("shows scenario name and tabs when scenario exists", () => {
    const s = createDefaultScenario("Test Plan");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPlan();
    expect(screen.getByText("Test Plan")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Accounts")).toBeInTheDocument();
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Life Events")).toBeInTheDocument();
    expect(screen.getByText("Withdrawal")).toBeInTheDocument();
    expect(screen.getByText("Assumptions")).toBeInTheDocument();
  });

  it("shows 'View dashboard' button", () => {
    const s = createDefaultScenario("Nav Test");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPlan();
    expect(screen.getByText("View dashboard")).toBeInTheDocument();
  });

  it("defaults to profile tab content", () => {
    const s = createDefaultScenario("Profile Tab");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPlan();
    expect(screen.getByText("Your name")).toBeInTheDocument();
    expect(screen.getByText("Birth year")).toBeInTheDocument();
  });
});
