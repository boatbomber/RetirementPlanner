import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppStore } from "@/store";
import { createDefaultScenario } from "@/models/defaults";
import type { SimulationResult, YearlyPercentiles } from "@/models/results";
import { ReportsPage } from "../ReportsPage";

vi.mock("@/hooks/useSimulation", () => ({
  useSimulation: vi.fn(),
}));

function makePercentiles(startAge: number, years: number): YearlyPercentiles[] {
  return Array.from({ length: years }, (_, i) => ({
    year: 2026 + i,
    age: startAge + i,
    p5: 50_000 * (i + 1),
    p10: 80_000 * (i + 1),
    p25: 120_000 * (i + 1),
    p50: 200_000 * (i + 1),
    p75: 300_000 * (i + 1),
    p90: 400_000 * (i + 1),
    p95: 500_000 * (i + 1),
  }));
}

function makeResult(scenarioId: string): SimulationResult {
  return {
    scenarioId,
    timestamp: new Date().toISOString(),
    configSnapshot: {} as SimulationResult["configSnapshot"],
    durationMs: 500,
    successRate: 0.85,
    medianTerminalWealth: 1_000_000,
    medianPortfolioAtRetirement: 1_500_000,
    estimatedRetirementAge: 65,
    confidenceAge: 90,
    wealthByYear: makePercentiles(30, 5),
    incomeByYear: makePercentiles(30, 5),
    spendingByYear: makePercentiles(30, 5),
    taxByYear: makePercentiles(30, 5),
    ssIncomeByYear: makePercentiles(30, 5),
    withdrawalsByYear: makePercentiles(30, 5),
    rmdByYear: makePercentiles(30, 5),
    rothConversionByYear: makePercentiles(30, 5),
    accountBalancesByYear: [],
    adjustmentProbability: 0.12,
    medianMaxCutPercent: 0.05,
    p90MaxCutPercent: 0.12,
    terminalWealthBuckets: [],
    depletionAgeBuckets: [],
    warnings: [],
  };
}

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
      <ReportsPage />
    </MemoryRouter>,
  );
}

describe("ReportsPage", () => {
  beforeEach(resetStore);

  it("shows empty state when no scenario exists", () => {
    renderPage();
    expect(screen.getByText("No scenario")).toBeInTheDocument();
  });

  it("shows 'no simulation' state when scenario has no result", () => {
    const s = createDefaultScenario("Test Plan");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderPage();
    expect(screen.getByText("No simulation data")).toBeInTheDocument();
  });

  it("renders tabs when simulation data exists", () => {
    const s = createDefaultScenario("Test Plan");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "complete",
          progress: 1,
          result: makeResult(s.id),
          error: null,
          fingerprint: null,
        },
      },
    });
    renderPage();
    const tabs = screen.getAllByRole("tab");
    const tabLabels = tabs.map((t) => t.textContent);
    expect(tabLabels).toEqual([
      "Cash Flow",
      "Tax Projections",
      "Account Balances",
      "Withdrawal Schedule",
      "Social Security",
    ]);
  });

  it("shows scenario name in subtitle", () => {
    const s = createDefaultScenario("My Retirement");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "complete",
          progress: 1,
          result: makeResult(s.id),
          error: null,
          fingerprint: null,
        },
      },
    });
    renderPage();
    expect(screen.getByText(/My Retirement/)).toBeInTheDocument();
  });

  it("renders cash flow table with age column", () => {
    const s = createDefaultScenario("Plan");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "complete",
          progress: 1,
          result: makeResult(s.id),
          error: null,
          fingerprint: null,
        },
      },
    });
    renderPage();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("Total Income")).toBeInTheDocument();
    expect(screen.getByText("Net Cash Flow")).toBeInTheDocument();
    expect(screen.getByText("Portfolio p50")).toBeInTheDocument();
  });

  it("has export CSV button", () => {
    const s = createDefaultScenario("Plan");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "complete",
          progress: 1,
          result: makeResult(s.id),
          error: null,
          fingerprint: null,
        },
      },
    });
    renderPage();
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("shows density selector", () => {
    const s = createDefaultScenario("Plan");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "complete",
          progress: 1,
          result: makeResult(s.id),
          error: null,
          fingerprint: null,
        },
      },
    });
    renderPage();
    expect(screen.getByText("Density")).toBeInTheDocument();
  });
});
