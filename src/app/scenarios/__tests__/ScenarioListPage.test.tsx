import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppStore } from "@/store";
import { createDefaultScenario } from "@/models/defaults";
import { ScenarioListPage } from "../ScenarioListPage";

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

function renderPage() {
  return render(
    <MemoryRouter>
      <ScenarioListPage />
    </MemoryRouter>,
  );
}

describe("ScenarioListPage", () => {
  beforeEach(resetStore);

  it("shows empty state when no scenarios exist", () => {
    renderPage();
    expect(screen.getByText("No scenarios")).toBeInTheDocument();
    expect(screen.getByText("Start wizard")).toBeInTheDocument();
  });

  it("shows scenario cards when scenarios exist", () => {
    const s1 = createDefaultScenario("Plan A");
    const s2 = createDefaultScenario("Plan B");
    useAppStore.setState({
      scenarios: [s1, s2],
      activeScenarioId: s1.id,
    });
    renderPage();
    expect(screen.getByText("Plan A")).toBeInTheDocument();
    expect(screen.getByText("Plan B")).toBeInTheDocument();
  });

  it("shows success rate when simulation complete", () => {
    const s = createDefaultScenario("Simulated Plan");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "complete",
          progress: 1,
          result: {
            scenarioId: s.id,
            timestamp: new Date().toISOString(),
            configSnapshot: {} as never,
            durationMs: 500,
            successRate: 0.92,
            medianTerminalWealth: 1_000_000,
            medianPortfolioAtRetirement: 1_500_000,
            estimatedRetirementAge: 65,
            confidenceAge: 90,
            wealthByYear: [],
            incomeByYear: [],
            spendingByYear: [],
            taxByYear: [],
            ssIncomeByYear: [],
            withdrawalsByYear: [],
            rmdByYear: [],
            rothConversionByYear: [],
            accountBalancesByYear: [],
            adjustmentProbability: 0.1,
            medianMaxCutPercent: 0.05,
            p90MaxCutPercent: 0.12,
            terminalWealthBuckets: [],
            depletionAgeBuckets: [],
            warnings: [],
          },
          error: null,
          fingerprint: null,
        },
      },
    });
    renderPage();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows 'Not simulated' when no simulation exists", () => {
    const s = createDefaultScenario("No Sim");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPage();
    expect(screen.getByText("Not simulated")).toBeInTheDocument();
  });

  it("duplicates scenario correctly", () => {
    const s = createDefaultScenario("Original");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPage();

    fireEvent.click(screen.getByLabelText("Duplicate scenario"));

    const state = useAppStore.getState();
    expect(state.scenarios).toHaveLength(2);
    expect(state.scenarios[1].name).toBe("Copy of Original");
    expect(state.scenarios[1].id).not.toBe(s.id);
  });

  it("duplicate produces independent copy", () => {
    const s = createDefaultScenario("Independent");
    s.accounts = [
      {
        id: "acc-1",
        owner: "self",
        label: "Test Account",
        type: "traditional_401k",
        balance: 100_000,
        costBasis: 0,
        annualContribution: 10_000,
        employerMatch: 5_000,
        contributionEndAge: 65,
        allocation: {
          usLargeCap: 0.6,
          usSmallCap: 0.1,
          intlDeveloped: 0.1,
          intlEmerging: 0,
          usBonds: 0.15,
          tips: 0.05,
          cash: 0,
        },
        useGlidePath: false,
        glidePath: [],
        fixedAnnualReturn: null,
      },
    ];
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPage();

    fireEvent.click(screen.getByLabelText("Duplicate scenario"));

    const state = useAppStore.getState();
    const clone = state.scenarios[1];

    clone.accounts[0].balance = 999_999;
    expect(state.scenarios[0].accounts[0].balance).toBe(100_000);
  });

  it("shows delete confirmation modal", () => {
    const s = createDefaultScenario("Delete Me");
    s.isBaseline = false;
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPage();

    fireEvent.click(screen.getByLabelText("Delete scenario"));
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it("enables compare button when 2+ scenarios exist", () => {
    const s1 = createDefaultScenario("A");
    const s2 = createDefaultScenario("B");
    useAppStore.setState({
      scenarios: [s1, s2],
      activeScenarioId: s1.id,
    });
    renderPage();
    const btn = screen.getByText("Compare").closest("button")!;
    expect(btn).not.toBeDisabled();
  });

  it("disables compare button with single scenario", () => {
    const s = createDefaultScenario("Solo");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPage();
    const btn = screen.getByText("Compare").closest("button")!;
    expect(btn).toBeDisabled();
  });
});
